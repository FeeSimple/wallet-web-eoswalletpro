var express = require('express');
var bodyParser = require('body-parser');

var httpsServer = require('https');
var httpServer = require('http');
const fs = require('fs');

var path = require('path');
var Eos = require('./eos-pro/eosjs/src/index');
var ecc = require('./public/eosjs-ecc/src/index');

// Must use the module "eosjs" to perform transaction of creating new account.
// Because the "Eos" from source code doesn't work
var EosTx = require('eosjs');

require('dotenv').config();
const adminAccount = {
	name: process.env.ADMIN_ACCOUNT_NAME,
	privKey: process.env.ADMIN_ACCOUNT_PRIV
}

// Basic configuration of the EOS client
const eosConfig = {
	chainId: '1c6ae7719a2a3b4ecb19584a30ff510ba1b6ded86e1fd8b8fc22f1179c622a32',
	keyProvider: adminAccount.privKey,
	httpEndpoint: 'http://165.22.134.182:8877',
	expireInSeconds: 60,
	verbose: true,
	broadcast: true,
	sign: true
}

var eos = Eos(eosConfig);
var eosTx = EosTx(eosConfig);

var httpsApp = express();
var httpApp = express();
var port = 3000;

const httpsOpt = {
    cert: fs.readFileSync('/etc/letsencrypt/live/feesimplewallet.io-0002/fullchain.pem'),
    key: fs.readFileSync('/etc/letsencrypt/live/feesimplewallet.io-0002/privkey.pem')
};

//view
httpsApp.set('view engine', 'ejs');
httpsApp.set('views', path.join(__dirname, 'views'));
httpsApp.set('port', 443); // default port for https is 443

httpApp.set('port', 80); // default port for http is 80
httpApp.get("*", function (req, res, next) {
	let host = req.headers.host;
	if (host && host.match(/^www/) !== null ) {
    host = host.replace(/^www\./, '');
  }	
	res.redirect("https://" + host + req.path);
});

var fetchUrl = require("fetch").fetchUrl;

// source file is iso-8859-15 but it is converted to utf-8 automatically
let price;

function getPrice() {
	setInterval(function(){
		fetchUrl("https://api.coinmarketcap.com/v2/ticker/1765/?convert=EUR", function(error, meta, body){
			let x = body.toString();
			let f = JSON.parse(x);
	    	price = f.data.quotes.USD.price.toString();
		});
	}, 6000 * 10 * 10);
}

getPrice();

//Middleware
httpsApp.use(bodyParser.json());
httpsApp.use(bodyParser.urlencoded({extended: false}));

//Prevent click jacking
httpsApp.use(require('helmet')());

//Set static path for assets
httpsApp.use(express.static(path.join(__dirname, 'public')));

httpsApp.get('/', function(req, res) {
	eos.getInfo({}).then(result=> {
		let blockNum = result.head_block_num;
		let lastBlock = result.last_irreversible_block_num;
		let timestamp = result.head_block_time;
		let miner = result.head_block_producer;
		let cpulimit = result.block_cpu_limit;
		res.render('eoswalletpro', {
			blockNum: blockNum,
			lastBlock: lastBlock,
			timestamp: timestamp,
			miner: miner,
			cpulimit: cpulimit,
			price: price
		});
	}).catch(err=>{res.send({error: err}); res.end()});;
});

httpServer.createServer(httpApp).listen(httpApp.get('port'), function() {
	console.log('Express HTTP server listening on port ' + httpApp.get('port'));
});

httpsServer.createServer(httpsOpt, httpsApp).listen(httpsApp.get('port'), function() {
	console.log('Express HTTPS server listening on port ' + httpsApp.get('port'));
});

httpsApp.post('/getkeyaccount', function(req, res, status){
	let params = req.body;
	eos.getKeyAccounts(params.pubkey).then(result1=>{
		let accounts = result1.account_names;
		res.send({accounts: accounts});
		res.end();
	}).catch(err=>{
		res.send({e: err});
		res.end();
	});
});

function beautifyRam(ramAmount) {
  let ram = ramAmount;

  let cnt=0;
  while (cnt < 3 && ram >= 1024) {
    ram = ram/1024;
    cnt++;
  }
  ram = new Intl.NumberFormat().format(ram);
  if (cnt == 0) {
    ram = ram.toString() + " Byte";
  }
  else if (cnt == 1) {
    ram = ram.toString() + " KB";
  }
  else if (cnt == 2) {
    ram = ram.toString() + " MB";
  }
  else if (cnt == 3) {
    ram = ram.toString() + " GB";
  }

  return ram;
}

function beautifyCpu(cpuAmount) {
  let cpu = cpuAmount;

  let cnt=0;
  while (cnt < 2 && cpu >= 1000) {
    cpu = cpu/1000;
    cnt++;
  }
  cpu = new Intl.NumberFormat().format(cpu);
  if (cnt == 0) {
    cpu = cpu.toString() + " µs";
  }
  else if (cnt == 1) {
    cpu = cpu.toString() + " ms";
  }
  else if (cnt == 2) {
    cpu = cpu.toString() + " s";
  }

  return cpu;
}

// function getResourceStr(netLimit) {
//   let bandwidth = 'used ' + beautifyRam(netLimit.used);
//   bandwidth += ', available ' + beautifyRam(netLimit.available);
//   bandwidth += ', max ' + beautifyRam(netLimit.max);
//   return bandwidth;
// }

// Applicable for RAM, Bandwidth and also CPU
function getResourceStr(resource, cpu) {
  let resourceAvailable = resource.max - resource.used
  let resourceStr = new Intl.NumberFormat().format((resourceAvailable/resource.max) * 100).toString();
  resourceStr += ' % ';
  if (cpu) {
    resourceStr += '(' + beautifyCpu(resourceAvailable);
  }
  else {
    resourceStr += '(' + beautifyRam(resourceAvailable);
  }
  if (cpu) {
    resourceStr += ' / ' + beautifyCpu(resourceAvailable);
  }
  else {
    resourceStr += ' / ' + beautifyRam(resource.max);
  }
  resourceStr += ')';
  return resourceStr;
}

httpsApp.post('/lookupacct', function(req, res, status){
	eos.getAccount(req.body.targetAcct).then(result=>{
		let account = req.body.targetAcct;
		let created = result.created;
		
    // let ram = beautifyRam(result.ram_quota);
    let ramStr = getResourceStr({used: result.ram_usage, max: result.ram_quota});
    let bandwidthStr = getResourceStr(result.net_limit);
    console.log('lookupacct - ram: ', ramStr, ', bandwidth: ', bandwidthStr);
		let keyreturn = result.permissions[0].required_auth.keys[0].key;
		res.send({account: account, 
      created: created, 
      ram: {str: ramStr, used: result.ram_usage, max: result.ram_quota},
      bandwidth: {str: bandwidthStr, used: result.net_limit.used, max: result.net_limit.max},
      pubkey: keyreturn});
		res.end();
	}).catch(err=>{res.send(err); res.end(); console.log('lookupacct error: ', err);});
});

httpsApp.post('/getbalance', function (req, res){
	eos.getTableRows({code: 'eosio.token', scope: req.body.targetAcct, table: 'accounts', json: true}).then(result2=>{
		res.send(result2.rows);
		res.end();
	}).catch(err=>{res.send({e: err}); res.end();});
});

httpsApp.post('/pubtoacct', function(req, res){
	eos.getAccount(req.body.account_target).then(result=>{
    // let ram_quota = new Intl.NumberFormat().format(result.ram_quota);
    // let ram_quota = beautifyRam(result.ram_quota);
		// let ram_usage = beautifyRam(result.ram_usage);
    let ramStr = getResourceStr({used: result.ram_usage, max: result.ram_quota});
		//let bandwidth = result.delegated_bandwidth;
    let bandwidthStr = getResourceStr(result.net_limit);
    // let cpu_limit = new Intl.NumberFormat().format(result.cpu_limit.available) + ' µs'; 
    let cpuStr = getResourceStr({used: result.cpu_limit.used, max: result.cpu_limit.max}, true);
		let created = result.created;
		let account = result.account_name;
		let requiredkey = result.permissions[0].required_auth.keys[0].key;
		if (result.account_name) {
			eos.getTableRows({code: 'eosio.token', scope: req.body.account_target, table: 'accounts', json: true}).then(result2=>{
				let balances = result2;
				res.send({
					returnkey: requiredkey,
					account: account,
					balances: {balances: balances},
					// ram_quota: ram_quota,
					// ram_usage: ram_usage,
          ram: {str: ramStr, used: result.ram_usage, max: result.ram_quota},
					// cpu_limit: cpu_limit,
          cpu: {str: cpuStr, used: result.cpu_limit.used, max: result.cpu_limit.max},
          bandwidth: {str: bandwidthStr, used: result.net_limit.used, max: result.net_limit.max},
					created: created
				});
				res.end();
			}).catch(function(){res.send({error: "error"}); res.end()});;
		}
	}).catch(function(){res.send({error: "error"}); res.end()});
});



//----------------------- LOGIN WITH PUBLIC KEY ------------------------//

httpsApp.post('/login', function(req, res, status){
	let params = req.body;
	let pubkey = req.body.pubkey
	eos.getAccount(params.account).then(result1=>{
		let required = result1.permissions[0].required_auth.keys[0].key;
		if (req.body.pubkeys === required) {
			res.send({login: true, returnkey: required});
			res.end();
		} else {
			res.send({e: "Error - key does not match account permissions"});
			res.end();
		}
	}).catch(err=>{res.send({e: "Error - could not find account"}); res.end();});
});

//----------------------- LOGIN WITH PUBLIC KEY ------------------------//



//This still needs to be implemented safely -------------------------//
//----------------------- CREATE NEW ACCOUNT ------------------------//

let alphabet = "abcdefghijklmnopqurstuvwxyz12345"

httpsApp.post('/createaccount', function(req, res, status) {
	let newAccPubkey = req.body.pubkey;
	let newAccName = req.body.name;

	// Never use directly the API "newaccount()" of eosjs because it uses only the "EOS" symbol
	// while the native symbol is "XFS".
	// eos.newaccount({creator: adminAccount.name, name: newAccName, owner: newAccPubkey, active: newAccPubkey})
	// .then(result=>{
	// 	res.send(result);
	// 	res.end();
	// }).catch(err=>{res.send(err); res.end();});

	eosTx.transaction(tr => {

    tr.newaccount({
        creator: adminAccount.name,
        name: newAccName,
        owner: newAccPubkey,
				active: newAccPubkey
    });

    tr.buyrambytes({
        payer: adminAccount.name,
        receiver: newAccName,
				bytes: 10240
    });

    tr.delegatebw({
        from: adminAccount.name,
        receiver: newAccName,
        stake_net_quantity: '10.0000 XFS',
        stake_cpu_quantity: '10.0000 XFS',
        transfer: 0
    });
	})
	.then(result=>{
		res.send({
			status: 'success',
			data: result
		});
		res.end();
		console.log('createaccount - res: ', result);
	})
	.catch(err=>{
		res.send({
			status: 'error',
			data: err
		});
		res.end();
		console.log('createaccount - err: ', err);
	});
});

//----------------------- CREATE NEW ACCOUNT ------------------------//

//----------------------- BUY RAM ------------------------//

httpsApp.post('/buyram', function(req, res, status) {
	let receiver = req.body.receiver;
	let payer = req.body.payer;
  let amount = parseInt(req.body.amount);

	eosTx.transaction(tr => {

    tr.buyrambytes({
        payer: payer,
        receiver: receiver,
				bytes: amount
    });
	})
	.then(result=>{
		res.send({
			status: 'success',
			data: result
		});
		res.end();
		console.log('buyram - res: ', result);
	})
	.catch(err=>{
		res.send({
			status: 'error',
			data: err
		});
		res.end();
		console.log('buyram - err: ', err);
	});
});

//----------------------- BUY RAM ------------------------//


//----------------------- CREATE RAW EOS TRANSACTION ------------------------//

httpsApp.post('/transaction', function(req, res, status) {
	let params = req.body;
	let memo = params.memo;
  const accountNotExistErr = 'Account does not exist';
	eos.getAccount(params.to).then(result1=>{
		if (params.memo && memo.length < 200) {
			memo = params.memo;
		} else {
			memo = '';
		}
		if (params.to && params.amount && result1.account_name) {
			eos.getAccount(params.from).then(result2=>{
				if (result2.cpu_limit.available > 800) {
					eos.transfer(params.from, params.to, params.amount, memo, {broadcast: false, sign: false}).then(result=>{
						let packedtr = result.transaction;
						let packedTr = JSON.stringify(packedtr);
						let stringBuf = JSON.stringify(result.buffer);
						res.send({buf: stringBuf, packedTr: packedTr});
						res.end();
					}).catch(err => {
						res.send({e: err});
						res.end();
					});
				} else {
					res.send({e: "Your account has exceeded its assigned CPU limit. Please try again later."});
					res.end();
				}
			}).catch(err=>{res.send({e: accountNotExistErr}); res.end();})

		} else {
			res.send({e: accountNotExistErr});
			res.end();
		}
	}).catch(err=>{res.send({e: accountNotExistErr}); res.end();});
});

//----------------------- CREATE RAW EOS TRANSACTION ------------------------//



//----------------------- PUSH SIGNED TRANSACTION ------------------------//

httpsApp.post('/pushtransaction', function(req, res) {
	let sigs;
  if (req.body.sigs) {
    sigs = req.body.sigs;
  } 
  else {
    let bufOri = req.body.bufOri;
    if (bufOri) {
      sigs = ecc.sign(Buffer.from(JSON.parse(bufOri)), adminAccount.privKey);
    }
    else {
      res.send({e: "Invalid signature produced"});
      res.end();
    }
	}

  let sigver = Eos.modules.ecc.Signature.from(sigs).toString();
  let lasig = [sigver];
  let transi = JSON.parse(req.body.packedTr);

  let package = {
    compression: 'none',
    transaction: transi,
    signatures: lasig
  }
  //Pushes tx in correct format
  eos.pushTransaction(package).then(result=>{
    res.send(result);
    res.end();
  }).catch(err => {
    res.send({e: "Either, you have exceeded your accounts balance, entered the wrong private key, or something else went wrong"});
    res.end();
  });
})

//----------------------- PUSH SIGNED TRANSACTION ------------------------//





