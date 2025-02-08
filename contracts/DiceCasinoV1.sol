// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";

contract DiceCasino is ReentrancyGuard, Pausable, Ownable {
    using SafeMath for uint256;

    uint256 public constant BASIS_POINTS = 10000;
    uint256 public constant MIN_CHANCE = 1;
    uint256 public constant MAX_CHANCE = 99;
    
    uint256 public houseEdge;        // in basis points (e.g., 200 = 2%)
    uint256 public minBet;           // in wei
    uint256 public maxBet;           // in wei
    uint256 public maxProfitPercent; // maximum profit as percentage of contract balance

    uint256 public currentBetId;
    uint256 public totalBets;
    uint256 public totalWagered;
    uint256 public totalPaidOut;

    struct Bet {
        address player;
        uint256 amount;
        uint256 chance;
        uint256 outcome;
        uint256 payout;
        uint256 timestamp;
        bool won;
        bool settled;
    }

    struct PlayerStats {
        uint256 totalBets;
        uint256 totalWagered;
        uint256 totalPayout;
        uint256 lastBetTimestamp;
    }

    mapping(uint256 => Bet) public bets;
    mapping(address => PlayerStats) public playerStats;
    mapping(address => uint256[]) public playerBetIds;

    event BetPlaced(
        uint256 indexed betId,
        address indexed player,
        uint256 amount,
        uint256 chance,
        uint256 outcome,
        uint256 payout,
        bool won
    );
    event HouseEdgeUpdated(uint256 newEdge);
    event BetLimitsUpdated(uint256 newMinBet, uint256 newMaxBet);
    event MaxProfitPercentUpdated(uint256 newMaxProfitPercent);
    event EmergencyWithdraw(address indexed owner, uint256 amount);

    constructor(
        uint256 _houseEdge,
        uint256 _minBet,
        uint256 _maxBet,
        uint256 _maxProfitPercent
    ) {
        require(_houseEdge <= 1000, "House edge too high"); // Max 10%
        houseEdge = _houseEdge;
        minBet = _minBet;
        maxBet = _maxBet;
        maxProfitPercent = _maxProfitPercent;
    }

    function placeBet(uint256 chance) 
        external 
        payable 
        nonReentrant 
        whenNotPaused 
        returns (uint256)
    {
        require(msg.value >= minBet, "Bet below minimum");
        require(msg.value <= maxBet, "Bet above maximum");
        require(chance >= MIN_CHANCE && chance <= MAX_CHANCE, "Invalid chance");
        
        uint256 potentialPayout = calculatePayout(msg.value, chance);
        require(potentialPayout <= getMaxPayout(), "Payout exceeds max");

        uint256 outcome = generateOutcome();
        bool won = outcome <= chance;

        uint256 payout = 0;
        if (won) {
            payout = potentialPayout;
            require(address(this).balance >= payout, "Insufficient contract balance");
            (bool sent,) = payable(msg.sender).call{value: payout}("");
            require(sent, "Failed to send payout");
            totalPaidOut = totalPaidOut.add(payout);
        }

        currentBetId++;
        bets[currentBetId] = Bet({
            player: msg.sender,
            amount: msg.value,
            chance: chance,
            outcome: outcome,
            payout: payout,
            timestamp: block.timestamp,
            won: won,
            settled: true
        });

        totalBets++;
        totalWagered = totalWagered.add(msg.value);
        playerBetIds[msg.sender].push(currentBetId);
        
        PlayerStats storage stats = playerStats[msg.sender];
        stats.totalBets++;
        stats.totalWagered = stats.totalWagered.add(msg.value);
        stats.totalPayout = stats.totalPayout.add(payout);
        stats.lastBetTimestamp = block.timestamp;

        emit BetPlaced(
            currentBetId,
            msg.sender,
            msg.value,
            chance,
            outcome,
            payout,
            won
        );

        return outcome;
    }

    function generateOutcome() internal view returns (uint256) {
        bytes32 randomHash = keccak256(
            abi.encodePacked(
                blockhash(block.number - 1),
                block.timestamp,
                msg.sender,
                currentBetId
            )
        );
        return (uint256(randomHash) % 100) + 1;
    }

    function calculatePayout(uint256 betAmount, uint256 chance) 
        public 
        view 
        returns (uint256) 
    {
        uint256 multiplier = BASIS_POINTS.mul(100).div(chance);
        uint256 grossPayout = betAmount.mul(multiplier).div(BASIS_POINTS);
        return grossPayout.mul(BASIS_POINTS.sub(houseEdge)).div(BASIS_POINTS);
    }

    function getMaxPayout() public view returns (uint256) {
        return address(this).balance.mul(maxProfitPercent).div(100);
    }

    function getPlayerBets(address player) 
        external 
        view 
        returns (uint256[] memory) 
    {
        return playerBetIds[player];
    }

    function getBetDetails(uint256 betId) 
        external 
        view 
        returns (Bet memory) 
    {
        return bets[betId];
    }

    function updateHouseEdge(uint256 newEdge) external onlyOwner {
        require(newEdge <= 1000, "House edge too high"); // Max 10%
        houseEdge = newEdge;
        emit HouseEdgeUpdated(newEdge);
    }

    function updateBetLimits(uint256 newMinBet, uint256 newMaxBet) 
        external 
        onlyOwner 
    {
        require(newMinBet < newMaxBet, "Invalid bet limits");
        minBet = newMinBet;
        maxBet = newMaxBet;
        emit BetLimitsUpdated(newMinBet, newMaxBet);
    }

    function updateMaxProfitPercent(uint256 newMaxProfitPercent) 
        external 
        onlyOwner 
    {
        require(newMaxProfitPercent <= 50, "Max profit too high"); // Max 50%
        maxProfitPercent = newMaxProfitPercent;
        emit MaxProfitPercentUpdated(newMaxProfitPercent);
    }

    function withdraw(uint256 amount) external onlyOwner nonReentrant {
        require(amount <= address(this).balance, "Insufficient balance");
        (bool sent,) = payable(owner()).call{value: amount}("");
        require(sent, "Failed to send");
        emit EmergencyWithdraw(owner(), amount);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function emergencyWithdraw() external onlyOwner {
        uint256 balance = address(this).balance;
        (bool sent,) = payable(owner()).call{value: balance}("");
        require(sent, "Failed to send");
        emit EmergencyWithdraw(owner(), balance);
    }

    receive() external payable {}
}