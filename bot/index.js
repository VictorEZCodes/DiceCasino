require('dotenv').config();
const { Telegraf } = require('telegraf');
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

// Contract info
const CASINO_ADDRESS = '0x68f4C2c51464d25d5a50E995af55775534a21d29';
const CASINO_ABI = require('../artifacts/contracts/DiceCasinoV1.sol/DiceCasino.json').abi;

const provider = new ethers.JsonRpcProvider('https://data-seed-prebsc-1-s1.binance.org:8545');
const casino = new ethers.Contract(CASINO_ADDRESS, CASINO_ABI, provider);

// Wallet storage setup
const WALLET_FILE = path.join(__dirname, 'wallets.json');
let wallets = {};

if (fs.existsSync(WALLET_FILE)) {
    wallets = JSON.parse(fs.readFileSync(WALLET_FILE, 'utf8'));
}

function saveWallet(userId, walletData) {
    wallets[userId] = walletData;
    fs.writeFileSync(WALLET_FILE, JSON.stringify(wallets, null, 2));
}

function getWallet(userId) {
    return wallets[userId];
}

// Initialize bot
const bot = new Telegraf(process.env.BOT_TOKEN);

// Commands
bot.command('start', async (ctx) => {
    const message = `Welcome to Dice Casino Bot! 🎲\n\n` +
        `Available commands:\n` +
        `/createwallet - Create your wallet\n` +
        `/deposit - Get deposit address\n` +
        `/withdraw - Withdraw your BNB\n` +
        `/mywallet - View wallet details\n` +
        `/bet <amount> <chance> - Place a bet\n` +
        `/mybets - View bet history\n` +
        `/balance - Check balance\n` +
        `/rules - Game rules`;
    
    await ctx.reply(message);
});

// Create wallet to start using bot
bot.command('createwallet', async (ctx) => {
    const userId = ctx.from.id;
    
    if (getWallet(userId)) {
        return ctx.reply('You already have a wallet! Use /mywallet to view details.');
    }

    const wallet = ethers.Wallet.createRandom();
    saveWallet(userId, {
        address: wallet.address,
        privateKey: wallet.privateKey
    });

    const message = `Your new wallet has been created!\n\n` +
        `Address: ${wallet.address}\n` +
        `Private Key: ${wallet.privateKey}\n\n` +
        `⚠️ IMPORTANT: Save your private key securely! It will only be shown once!`;

    await ctx.reply(message);
});

// Deposit to wallet
bot.command('deposit', async (ctx) => {
    const userId = ctx.from.id;
    const wallet = getWallet(userId);

    if (!wallet) {
        return ctx.reply('Create a wallet first with /createwallet');
    }

    await ctx.reply(
        `To deposit funds, send BNB to your wallet address:\n\n` +
        `${wallet.address}\n\n` +
        `Your balance will update automatically after the transaction is confirmed.`
    );
});

// Withdraw from wallet
bot.command('withdraw', async (ctx) => {
    const userId = ctx.from.id;
    const wallet = getWallet(userId);

    if (!wallet) {
        return ctx.reply('Create a wallet first with /createwallet');
    }

    const args = ctx.message.text.split(' ');
    if (args.length !== 3) {
        return ctx.reply(
            'Usage: /withdraw <amount> <address>\n' +
            'Example: /withdraw 0.1 0x1234...\n' +
            'Use "all" as amount to withdraw entire balance'
        );
    }

    try {
        if (!ethers.isAddress(args[2])) {
            return ctx.reply('❌ Invalid withdrawal address');
        }

        const balance = await provider.getBalance(wallet.address);
        let amount;
        
        if (args[1].toLowerCase() === 'all') {
            const gasPrice = await provider.getFeeData().then(data => data.gasPrice);
            const estimatedGas = BigInt(21000) * gasPrice;
            amount = balance - estimatedGas;
            
            if (amount <= 0n) {
                return ctx.reply('❌ Insufficient balance to cover gas fees');
            }
        } else {
            amount = ethers.parseEther(args[1]);
            const gasPrice = await provider.getFeeData().then(data => data.gasPrice);
            const estimatedGas = BigInt(21000) * gasPrice;
            const totalNeeded = amount + estimatedGas;

            if (balance < totalNeeded) {
                return ctx.reply(
                    `❌ Insufficient funds\n\n` +
                    `Withdrawal amount: ${ethers.formatEther(amount)} BNB\n` +
                    `Estimated gas: ${ethers.formatEther(estimatedGas)} BNB\n` +
                    `Total needed: ${ethers.formatEther(totalNeeded)} BNB\n` +
                    `Your balance: ${ethers.formatEther(balance)} BNB`
                );
            }
        }

        const signer = new ethers.Wallet(wallet.privateKey, provider);
        
        const tx = await signer.sendTransaction({
            to: args[2],
            value: amount
        });

        await ctx.reply(
            `💸 Withdrawing ${ethers.formatEther(amount)} BNB to ${args[2]}...\n\n` +
            `Transaction sent, waiting for confirmation...`
        );

        await tx.wait();
        const newBalance = await provider.getBalance(wallet.address);

        await ctx.reply(
            `✅ Withdrawal successful!\n\n` +
            `Amount: ${ethers.formatEther(amount)} BNB\n` +
            `To: ${args[2]}\n` +
            `New balance: ${ethers.formatEther(newBalance)} BNB`
        );

    } catch (error) {
        let errorMessage = '❌ Error: ';
        
        if (error.code === 'INSUFFICIENT_FUNDS') {
            errorMessage += 'Not enough BNB to cover withdrawal and gas fees';
        }
        else if (error.reason) {
            errorMessage += error.reason;
        }
        else if (error.message.includes('invalid BigNumber')) {
            errorMessage += 'Invalid amount format';
        }
        else {
            errorMessage += 'Unknown error occurred';
            console.error('Detailed error:', error);
        }

        await ctx.reply(errorMessage);
    }
});

// View wallet
bot.command('mywallet', async (ctx) => {
    const userId = ctx.from.id;
    const wallet = getWallet(userId);

    if (!wallet) {
        return ctx.reply('You don\'t have a wallet yet! Use /createwallet to create one.');
    }

    const balance = await provider.getBalance(wallet.address);
    const balanceInBNB = ethers.formatEther(balance);

    await ctx.reply(
        `Wallet Address: ${wallet.address}\n` +
        `Current Balance: ${balanceInBNB} BNB`
    );
});

// Place bet
bot.command('bet', async (ctx) => {
    const userId = ctx.from.id;
    const wallet = getWallet(userId);

    if (!wallet) {
        return ctx.reply('Create a wallet first with /createwallet');
    }

    const args = ctx.message.text.split(' ');
    if (args.length !== 3) {
        return ctx.reply('Usage: /bet <amount> <chance>\nExample: /bet 0.1 45');
    }

    try {
        const amount = ethers.parseEther(args[1]);
        const chance = parseInt(args[2]);

        if (chance < 1 || chance > 99) {
            return ctx.reply('❌ Chance must be between 1 and 99');
        }
        
        // Pre-flight checks
        const balance = await provider.getBalance(wallet.address);
        const estimatedGas = BigInt(300000) * BigInt(await provider.getFeeData().then(data => data.gasPrice));
        const totalNeeded = amount + estimatedGas;

        if (balance < totalNeeded) {
            return ctx.reply(
                `❌ Insufficient funds\n\n` +
                `Required for bet: ${ethers.formatEther(amount)} BNB\n` +
                `Estimated gas: ${ethers.formatEther(estimatedGas)} BNB\n` +
                `Total needed: ${ethers.formatEther(totalNeeded)} BNB\n` +
                `Your balance: ${ethers.formatEther(balance)} BNB`
            );
        }

        const minBet = await casino.minBet();
        const maxBet = await casino.maxBet();
        if (amount < minBet || amount > maxBet) {
            return ctx.reply(
                `❌ Invalid bet amount\n\n` +
                `Minimum: ${ethers.formatEther(minBet)} BNB\n` +
                `Maximum: ${ethers.formatEther(maxBet)} BNB`
            );
        }

        const maxPayout = await casino.getMaxPayout();
        const potentialPayout = await casino.calculatePayout(amount, chance);
        if (potentialPayout > maxPayout) {
            return ctx.reply(
                `❌ Potential payout exceeds maximum\n\n` +
                `Your payout: ${ethers.formatEther(potentialPayout)} BNB\n` +
                `Maximum allowed: ${ethers.formatEther(maxPayout)} BNB\n\n` +
                `Try reducing your bet amount or increasing your chance`
            );
        }

        const signer = new ethers.Wallet(wallet.privateKey, provider);
        const casinoWithSigner = casino.connect(signer);

        // Place the bet
        const tx = await casinoWithSigner.placeBet(chance, { 
            value: amount,
            gasLimit: 300000
        });

        await ctx.reply(
            `🎲 Placing your bet...\n\n` +
            `Amount: ${args[1]} BNB\n` +
            `Chance: ${chance}%\n` +
            `Potential win: ${ethers.formatEther(potentialPayout)} BNB\n\n` +
            `Transaction sent, waiting for confirmation...`
        );

        const receipt = await tx.wait();
        const event = receipt.logs.find(log => {
            try {
                return casino.interface.parseLog(log).name === 'BetPlaced';
            } catch (e) {
                return false;
            }
        });
        
        if (event) {
            const parsedEvent = casino.interface.parseLog(event);
            const { outcome, won, payout } = parsedEvent.args;
            const payoutInBNB = ethers.formatEther(payout);
            
            const resultMessage = won ? 
                `🎉 You won!\n\n` +
                `Dice roll: ${outcome}\n` +
                `Payout: ${payoutInBNB} BNB` :
                `😢 You lost\n\n` +
                `Dice roll: ${outcome}\n` +
                `Better luck next time!`;
            
            await ctx.reply(resultMessage);
        }

    } catch (error) {
        let errorMessage = '❌ Error: ';
        
        if (error.code === 'INSUFFICIENT_FUNDS') {
            errorMessage += 'Not enough BNB to cover bet and gas fees';
        }
        else if (error.reason) {
            errorMessage += error.reason;
        }
        else if (error.message.includes('gas')) {
            errorMessage += 'Gas estimation failed';
        }
        else if (error.message.includes('rejected')) {
            errorMessage += 'Transaction rejected';
        }
        else {
            errorMessage += 'Unknown error occurred';
            console.error('Detailed error:', error);
        }

        await ctx.reply(errorMessage);
    }
});

// View all bets
bot.command('mybets', async (ctx) => {
    const userId = ctx.from.id;
    const wallet = getWallet(userId);

    if (!wallet) {
        return ctx.reply('Create a wallet first with /createwallet');
    }

    try {
        const bets = await casino.getPlayerBets(wallet.address);
        if (bets.length === 0) {
            return ctx.reply('You haven\'t placed any bets yet!');
        }

        let message = 'Your Bet History:\n\n';
        for (const betId of bets) {
            const bet = await casino.getBetDetails(betId);
            const amount = ethers.formatEther(bet.amount);
            const payout = ethers.formatEther(bet.payout);
            
            message += `Bet ID ${betId}:\n` +
                      `Amount: ${amount} BNB\n` +
                      `Chance: ${bet.chance}\n` +
                      `Outcome: ${bet.outcome}\n` +
                      `${bet.won ? `Won (Payout: ${payout} BNB)` : 'Lost'}\n\n`;
        }

        await ctx.reply(message);
    } catch (error) {
        await ctx.reply(`Error: ${error.message}`);
    }
});

// View wallet balance
bot.command('balance', async (ctx) => {
    const userId = ctx.from.id;
    const wallet = getWallet(userId);

    if (!wallet) {
        return ctx.reply('Create a wallet first with /createwallet');
    }

    try {
        const balance = await provider.getBalance(wallet.address);
        const stats = await casino.playerStats(wallet.address);
        
        const balanceInBNB = ethers.formatEther(balance);
        const wagered = ethers.formatEther(stats.totalWagered);
        const payouts = ethers.formatEther(stats.totalPayout);
        const netResult = ethers.formatEther(stats.totalPayout - stats.totalWagered);

        await ctx.reply(
            `💰 Balance: ${balanceInBNB} BNB\n` +
            `🎲 Total Bets: ${stats.totalBets.toString()}\n` +
            `💸 Total Wagered: ${wagered} BNB\n` +
            `💵 Total Payouts: ${payouts} BNB\n` +
            `📊 Net Result: ${netResult} BNB`
        );
    } catch (error) {
        await ctx.reply(`Error: ${error.message}`);
    }
});

// Calculate payout
bot.command('calc', async (ctx) => {
    const args = ctx.message.text.split(' ');
    if (args.length !== 3) {
        return ctx.reply('Usage: /calc <amount> <chance>\nExample: /calc 0.1 45');
    }

    try {
        const amount = ethers.parseEther(args[1]);
        const chance = parseInt(args[2]);
        
        const contractBalance = await provider.getBalance(CASINO_ADDRESS);
        const maxPayout = await casino.getMaxPayout();
        const potentialPayout = await casino.calculatePayout(amount, chance);
        const minBet = await casino.minBet();
        const maxBet = await casino.maxBet();
        
        let validationMessage = '';
        if (amount < minBet) validationMessage = '❌ Bet amount below minimum!';
        else if (amount > maxBet) validationMessage = '❌ Bet amount above maximum!';
        else if (potentialPayout > maxPayout) validationMessage = '❌ Potential payout exceeds maximum!';
        else validationMessage = '✅ This bet is within all limits!';
        
        const message = 
            `💰 Contract Balance: ${ethers.formatEther(contractBalance)} BNB\n` +
            `🎯 Chance: ${chance}%\n` +
            `💵 Bet Amount: ${args[1]} BNB\n` +
            `🏆 Potential Payout: ${ethers.formatEther(potentialPayout)} BNB\n` +
            `📊 Max Allowed Payout: ${ethers.formatEther(maxPayout)} BNB\n` +
            `📈 Bet Limits: ${ethers.formatEther(minBet)} - ${ethers.formatEther(maxBet)} BNB\n\n` +
            validationMessage;

        await ctx.reply(message);
    } catch (error) {
        await ctx.reply(`Error: ${error.message}`);
    }
});

// Bot rules
bot.command('rules', async (ctx) => {
    const message = 
        `🎲 Dice Casino Rules:\n\n` +
        `1. Choose your bet amount and chance (1-99)\n` +
        `2. The higher your chance, the lower your potential payout\n` +
        `3. If the dice roll is less than or equal to your chosen number, you win!\n` +
        `4. House edge: 2%\n\n` +
        `Example Payouts (1 BNB bet):\n` +
        `- 50% chance: 1.96 BNB\n` +
        `- 25% chance: 3.92 BNB\n` +
        `- 10% chance: 9.8 BNB\n\n` +
        `🔒 Provably Fair:\n` +
        `• Results are generated using blockchain data\n` +
        `• Every bet can be verified on BscScan`;

    await ctx.reply(message);
});

// Start bot
bot.launch().then(() => {
    console.log('Bot is running...');
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));