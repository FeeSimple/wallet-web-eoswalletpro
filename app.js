var express = require('express');
var bodyParser = require('body-parser');

var httpsServer = require('https');
var httpServer = require('http');
const fs = require('fs');

var path = require('path');
var Eos = require('./eos-pro/eosjs/src/index');
var eos = Eos({httpEndpoint: 'http://138.197.194.220:8877', chainId: "1c6ae7719a2a3b4ecb19584a30ff510ba1b6ded86e1fd8b8fc22f1179c622a32"});

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
	if (host.match(/^www/) !== null ) {
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

httpsApp.post('/lookupacct', function(req, res, status){
	eos.getAccount(req.body.targetAcct).then(result=>{
		let account = req.body.targetAcct;
		let created = result.created;
		let ram = result.ram_quota;
		let bandwidth = result.delegated_bandwidth;
		let keyreturn = result.permissions[0].required_auth.keys[0].key;
		res.send({account: account, created: created, ram: ram, bandwidth: bandwidth, pubkey: keyreturn});
		res.end();
	}).catch(err=>{res.send(err); res.end();});
});

httpsApp.post('/getbalance', function (req, res){
	eos.getTableRows({code: 'eosio.token', scope: req.body.targetAcct, table: 'accounts', json: true}).then(result2=>{
		res.send(result2.rows);
		res.end();
	}).catch(err=>{res.send({e: err}); res.end();});
});

httpsApp.post('/pubtoacct', function(req, res){
	eos.getAccount(req.body.account_target).then(result=>{
		let ram_quota = result.ram_quota;
		let ram_usage = result.ram_usage;
		let bandwidth = result.delegated_bandwidth;
		let cpu_limit = result.cpu_limit.available; 
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
					ram_quota: ram_quota,
					cpu_limit: cpu_limit,
					ram_usage: ram_usage,
					bandwidth: bandwidth,
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
	let key = req.body.pubkey;
	let rand = alphabet[Math.floor(Math.random()*alphabet.length)];
	eos.newaccount({creator: 'justin', name: rand, owner: key, active: key}).then(result=>{
		res.send(result);
		res.end();
	}).catch(err=>{res.send(err); res.end();});
});

//----------------------- CREATE NEW ACCOUNT ------------------------//




//----------------------- CREATE RAW EOS TRANSACTION ------------------------//

httpsApp.post('/transaction', function(req, res, status) {
	let params = req.body;
	let memo = params.memo;
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
			}).catch(err=>{res.send({e: "The account you are trying to send from does not exit"}); res.end();})

		} else {
			res.send({e: "Error - The account you are trying to send to does not exit"});
			res.end();
		}
	}).catch(err=>{res.send({e: "The account you are trying to send to does not exit"}); res.end();});
});

//----------------------- CREATE RAW EOS TRANSACTION ------------------------//



//----------------------- PUSH SIGNED TRANSACTION ------------------------//

httpsApp.post('/pushtransaction', function(req, res) {
	if (req.body.sigs) {
		let sigver = Eos.modules.ecc.Signature.from(req.body.sigs).toString();
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
	} else {
		res.send({e: "Invalid signature produced"});
		res.end();
	}
})

//----------------------- PUSH SIGNED TRANSACTION ------------------------//





