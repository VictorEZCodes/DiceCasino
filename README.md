# Dice Casino

A decentralized gambling platform on BNB Chain (BSC) that lets users play a provably fair dice game using BNB.

## How It Works

### Smart Contract (DiceCasinoV1.sol)
- Users can place bets by specifying an amount and a chance (1-99)
- Random numbers are generated using block hash, timestamp, and user data
- House edge is set to 2%
- Built-in safety features:
  - Maximum bet limits
  - Maximum payout limits (% of contract balance)
  - Pausable in emergencies
  - Reentrancy protection
  - Owner controls for risk management

### Telegram Bot (index.js)
The bot provides an easy interface to interact with the smart contract:

**Core Features:**
- Wallet Management:
  - Create new wallets
  - Check balance
  - Deposit BNB
  - Withdraw to any address
  
- Betting:
  - Place bets with custom amounts and chances
  - View bet history
  - Calculate potential payouts
  - Real-time results

**Example Payouts:**
- 50% chance: 1.96x bet amount
- 25% chance: 3.92x bet amount
- 10% chance: 9.8x bet amount

### Provably Fair System
The randomness is derived from:
- Previous block hash
- Block timestamp
- Player's address
- Current bet ID

This ensures transparency while maintaining unpredictability of results.