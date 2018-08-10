# feesimple.io/wallet

A secure, native eos wallet for storing eos and tokens that follow the eosio.token standard.

# How to build locally on unix

```
git clone https://github.com/Hashbit-Technologies/eoswalletpro
cd eoswalletpro
npm install

cd public
git clone https://github.com/EOSIO/eosjs-ecc.git
cd eosjs-ecc
npm install
npm run build

cd eos-pro/eosjs
npm install
cd ..
cd ..
node app
```

Now you can visit: 
http://localhost:3000
http://127.0.0.1:3000

# Enable HTTPS

Ref link: https://medium.com/@yash.kulshrestha/using-lets-encrypt-with-express-e069c7abe625  
Ref link: https://gist.github.com/ryanhanwu/5321302

Command: `certbot certonly --webroot -w ./public -d www.feesimplewallet.io -d feesimplewallet.io`
