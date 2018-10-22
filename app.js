
const bodyParser = require('body-parser');
const express = require('express');
const helmet = require('helmet');
const sodium_api = require('sodium').api;
const sodium = require('sodium');
const zxcvbn = require('zxcvbn');

const generateKey = (len) => {
  const key = Buffer.allocUnsafe(len);
  sodium_api.randombytes_buf(key, len);
  return key;
};

const generateTokenDict = () => {
	const key = Buffer.concat([sibling_key, user_key]);
	const auth = new sodium.Auth(key);
	const valid_until = (Date.now() + token_window).toString()
	const mac = auth.generate(valid_until).toString('base64');
	return ({ mac: mac, valid_until: valid_until});
};

const token_window = 60000;
const port = process.env.PORT || 3000;
const app = express();

let sibling_key = generateKey(16);

app.use(helmet())
app.use(bodyParser.json());
let hash, user_key;

app.use('/auth', (req, res, next) => {
	const key = Buffer.concat([sibling_key, user_key]);
	const auth = new sodium.Auth(key);
	const mac = Buffer.from(req.body.mac, 'base64');
	const valid_until = req.body.valid_until;
	const isValid = auth.validate(mac, valid_until);
	if (!isValid || !(Date.now() < parseInt(valid_until))) {
		res.send({error: 'invalid'});
	} else {
		next();
	}
});

app.post('/auth/test', (req, res) => {
	res.send(generateTokenDict());
});

app.post('/signup', (req, res) => {
	const username = req.body.username;
	const password = req.body.password;
	const score = zxcvbn(req.body.password).score;
	if (score > 2) {
		console.log(`SIGNUP_SUCCESSFUL: with username [${username}] and password score ${score}/4`)
		hash = sodium_api.crypto_pwhash_str(
	 		Buffer.from(req.body.password),
		 	sodium_api.crypto_pwhash_OPSLIMIT_SENSITIVE,
			sodium_api.crypto_pwhash_MEMLIMIT_INTERACTIVE);
		user_key = generateKey(16);
		res.send();
	} else {
		console.log(`SIGNUP_WEAK_PASSWORD: signup attempted with username [${username}] and a password with a score of ${score}/4`)
		res.send({ error: 'Your proposed password is too weak.  <a href="https://xkpasswd.net">Consider using this tool to generate a secure, memorable password.</a>' })
	}
});

app.post('/login', function (req, res) {
	const isValid = sodium_api.crypto_pwhash_str_verify(hash, Buffer.from(req.body.password));
	const username = req.body.username;
	if (isValid) {
		const key = Buffer.concat([sibling_key, user_key]);
		const auth = new sodium.Auth(key);
		const valid_until = (Date.now() + token_window).toString()
		const mac = auth.generate(valid_until);
		console.log(`LOGIN_SUCCESSFUL: with username [${username}]`);
		res.send( { valid_until: valid_until, mac: mac.toString('base64') } );
	} else {
		console.log(`LOGIN_FAILED: with username [${username}]`);
		res.send( { error: 'Login error' });
	}
});

module.exports = app.listen(port, function () {
  console.log(`Example app listening on port ${port}!`);
});