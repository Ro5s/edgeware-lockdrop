require('dotenv').config();
const program = require('commander');
const Web3 = require('web3');
const EthereumTx = require('ethereumjs-tx')
const fs = require('fs');
const ldHelpers = require("../helpers/lockdropHelper.js");

const LOCKDROP_JSON = JSON.parse(fs.readFileSync('./build/contracts/Lockdrop.json').toString());
const ETH_PRIVATE_KEY = process.env.ETH_PRIVATE_KEY;
const ETH_ADDRESS = process.env.ETH_ADDRESS;
const LOCKDROP_CONTRACT_ADDRESS = process.env.LOCKDROP_CONTRACT_ADDRESS;
const LOCALHOST_URL = 'http://localhost:8545';

program
  .version('0.1.0')
  .option('-b, --balance', 'Get the total balance across all locks')
  .option('-l, --lock', 'Lock ETH with the lockdrop')
  .option('-s, --signal <signalingAddress>', 'Signal a contract balance in the lockdrop')
  .option('-n, --nonce <nonce>', 'Transaction nonce that created a specific contract address')
  .option('-u, --unlock', 'Unlock ETH from a specific lock contract')
  .option('-r, --remoteUrl <url>', 'The remote URL of an Ethereum node (defaults to localhost:8545)')
  .option('--lockContractAddress <addr>', 'The Ethereum address for a lock contract (NOT A LOCKDROP CONTRACT)')
  .option('--lockdropContractAddress <addr>', 'The Ethereum address for the target Lockdrop (THIS IS A LOCKDROP CONTRACT)')
  .option('--lockerAllocation', 'Get the allocation for the current set of lockers')
  .option('--ending', 'Get the remaining time of the lockdrop')
  .option('--lockLength <length>', 'The desired lock length - (3, 6, or 12)')
  .option('--lockValue <value>', 'The amount of Ether to lock')
  .option('--edgeAddress <key>', 'Edgeware ED25519 Base58 encoded address')
  .option('--isValidator', 'A boolean flag indicating intent to be a validator')
  .parse(process.argv);

async function getCurrentTimestamp(remoteUrl=LOCALHOST_URL) {
  const web3 = new Web3(new Web3.providers.HttpProvider(remoteUrl));
  const block = await web3.eth.getBlock("latest");
  return block.timestamp;
}

async function getLockdropAllocation(lockdropContractAddress, remoteUrl=LOCALHOST_URL, totalIssuance='5000000000000000000000000') {
  console.log('Fetching Lockdrop locked locks...');
  console.log("");
  const web3 = new Web3(new Web3.providers.HttpProvider(remoteUrl));
  const contract = new web3.eth.Contract(LOCKDROP_JSON.abi, lockdropContractAddress);
  const allocation = await ldHelpers.calculateEffectiveLocks(contract, totalIssuance);
  return allocation;
};

async function lock(lockdropAddress, length, value, edgeAddress, isValidator=false, remoteUrl=LOCALHOST_URL) {
  if (length != "3" || length != "6" || length != "12") throw new Error('Invalid length, must pass in 3, 6, 12');
  console.log(`locking ${value} into Lockdrop contract for ${length} days. Receiver: ${edgeAddress}`);
  console.log("");
  const web3 = new Web3(new Web3.providers.HttpProvider(remoteUrl));
  const contract = new web3.eth.Contract(LOCKDROP_JSON.abi, lockdropContractAddress);
  let lockLength = (length == "3") ? 3 : (length == "6") ? 6 : 12;
  let txNonce = await web3.eth.getTransactionCount(ETH_ADDRESS);
  const tx = new EthereumTx({
    nonce: txNonce,
    from: ETH_ADDRESS,
    to: lockdropAddress,
    gas: 150000,
    data: contract.methods.lock(length, edgeAddress, isValidator).encodeABI(),
    value,
  });

  tx.sign(Buffer.from(ETH_PRIVATE_KEY, 'hex'));
  var raw = '0x' + tx.serialize().toString('hex');
  const txHash = await web3.eth.sendSignedTransaction(raw);
  console.log(`Transaction send: ${txHash}`);
}

async function signal(lockdropAddress, signalingAddress, nonce, edgeAddress, remoteUrl=LOCALHOST_URL) {
  console.log(`Signaling into Lockdrop contract from address ${signalAddr}. Receiver: ${edgeAddress}`);
  console.log("");
  const web3 = new Web3(new Web3.providers.HttpProvider(remoteUrl));
  const contract = new web3.eth.Contract(LOCKDROP_JSON.abi, lockdropContractAddress);
  let txNonce = await web3.eth.getTransactionCount(ETH_ADDRESS);
  const tx = new EthereumTx({
    nonce: txNonce,
    from: ETH_ADDRESS,
    to: lockdropAddress,
    gas: 150000,
    data: contract.methods.signal(signalingAddress, nonce, edgeAddress).encodeABI(),
    value,
  }); 

  tx.sign(Buffer.from(ETH_PRIVATE_KEY, 'hex'));
  var raw = '0x' + tx.serialize().toString();
  const txHash = await web3.eth.sendSignedTransaction(raw);
  console.log(`Transaction send: ${txHash}`);
}

async function unlock(lockContractAddress, remoteUrl=LOCALHOST_URL) {
  console.log(`Unlocking lock for account: ${coinbase}`);
  console.log("");
  const web3 = new Web3(new Web3.providers.HttpProvider(remoteUrl));
  const contract = new web3.eth.Contract(LOCKDROP_JSON.abi, lockdropContractAddress);
  try {
    let txNonce = await web3.eth.getTransactionCount(ETH_ADDRESS);
    const tx = new EthereumTx({
      nonce: txNonce,
      from: ETH_ADDRESS,
      to: lockContractAddress,
      gas: 100000,
    });
    tx.sign(Buffer.from(ETH_PRIVATE_KEY, 'hex'));
    var raw = '0x' + tx.serialize().toString('hex');
    const txHash = await web3.eth.sendSignedTransaction(raw);
    console.log(`Transaction send: ${txHash}`);
  } catch(e) {
    console.log(e);
  }
}

async function getBalance(lockdropContractAddress, remoteUrl=LOCALHOST_URL) {
  console.log('Fetching Lockdrop balance...');
  console.log("");
  const web3 = new Web3(new Web3.providers.HttpProvider(remoteUrl));
  const contract = new web3.eth.Contract(LOCKDROP_JSON.abi, lockdropContractAddress);
  return await ldHelpers.getTotalLockedBalance(contract);
};

async function getEnding(lockdropContractAddress, remoteUrl=LOCALHOST_URL) {
  const web3 = new Web3(new Web3.providers.HttpProvider(remoteUrl));
  const contract = new web3.eth.Contract(LOCKDROP_JSON.abi, lockdropContractAddress);
  const coinbase = await web3.eth.getCoinbase();
  const ending = await contract.methods.LOCK_END_TIME().call({from: coinbase});
  const now = await getCurrentTimestamp(remoteUrl);
  console.log(`Ending in ${(ending - now) / 60} minutes`);
}

// At least one should be populated
if (!program.lockdropContractAddress && !!LOCKDROP_CONTRACT_ADDRESS) {
  throw new Error('Input a contract address for the Lockdrop contract');
}

// If passed in through .env
if (LOCKDROP_CONTRACT_ADDRESS) {
  program.lockdropContractAddress = LOCKDROP_CONTRACT_ADDRESS
}

if (program.lockerAllocation) getLockdropAllocation(program.lockdropContractAddress, program.remoteUrl);
if (program.balance) getBalance(program.lockdropContractAddress, program.remoteUrl);
if (program.ending) getEnding(program.lockdropContractAddress, program.remoteUrl);

if (program.lock) {
  if (!program.lockLength || !program.lockValue || !program.edgeAddress) {
    throw new Error('Please input a length and value using --lockLength, --lockValue and --edgeAddress');
  }
  lock(program.lockdropContractAddress, program.lockLength, program.lockValue, program.edgeAddress, (!!program.isValidator), program.remoteUrl);
}

if (program.signal) {
  console.log(program.signal);
  if (!program.nonce || !program.edgeAddress) {
    throw new Error('Please input a transaction nonce for the sending account with --nonce and --edgeAddress');
  }
  signal(program.lockdropContractAddress, program.signal, program.nonce, program.edgeAddress, program.remoteUrl);
}

if (program.unlock) {
  if (!program.lockContractAddress) {
    throw new Error('Please input a lock contract address to unlock from with --lockContractAddress');
  } else {
    unlock(program.lockContractAddress)
  }
}
