"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("reflect-metadata");
const stripe_1 = __importDefault(require("stripe"));
const body_parser_1 = __importDefault(require("body-parser"));
const express_1 = __importDefault(require("express"));
const helmet_1 = __importDefault(require("helmet"));
const joi_1 = __importDefault(require("joi"));
const sodium = require('sodium');
const zxcvbn_1 = __importDefault(require("zxcvbn"));
const stripe = new stripe_1.default("sk_test_4vUzfLsfzZ7ffojQgISR1ntd");
const generateKey = (len) => {
    const key = Buffer.allocUnsafe(len);
    sodium.api.randombytes_buf(key, len);
    return key;
};
const generateTokenDict = () => {
    const key = Buffer.concat([sibling_key, user_key]);
    const auth = new sodium.Auth(key);
    const valid_until = (Date.now() + token_window).toString();
    const mac = auth.generate(valid_until).toString('base64');
    return ({ mac: mac, valid_until: valid_until });
};
const token_window = 60000;
const port = process.env.PORT || 3000;
const app = express_1.default();
const plan = 'plan_DrPVwslmSpiOT4';
let sibling_key = generateKey(16);
let customer;
app.use(helmet_1.default());
app.use(body_parser_1.default.json());
let hash, user_key;
app.use('/auth', (req, res, next) => {
    const key = Buffer.concat([sibling_key, user_key]);
    const auth = new sodium.Auth(key);
    const mac = Buffer.from(req.body.mac, 'base64');
    const valid_until = req.body.valid_until;
    const isValid = auth.validate(mac, valid_until);
    if (!isValid || (Date.now() > parseInt(valid_until))) {
        res.send({ error: 'invalid' });
    }
    else {
        next();
    }
});
app.post('/auth/delete', (req, res) => {
    stripe.customers.del(customer.id).catch((err) => console.log('Customer deletion error:\n', (({ rawType, code, param, message, detail }) => ({ rawType, code, param, message, detail }))(err)));
    res.send();
});
app.post('/auth/test', (req, res) => {
    res.send(generateTokenDict());
});
app.post('/auth/refresh_auth_key', (req, res) => {
    user_key = generateKey(16);
    res.send({ message: 'invalid' });
});
app.post('/signup', (req, res) => __awaiter(this, void 0, void 0, function* () {
    customer = null;
    const validation = signup_schema.validate(req.body);
    if (validation.error) {
        console.log('validation error', validation.error.details[0].message);
        res.send({ error: 'validation_error' });
        return;
    }
    const email = req.body.email;
    const password = req.body.password;
    const stripe_token = req.body.stripe_token;
    const score = zxcvbn_1.default(req.body.password).score;
    if (score < 3) {
        console.log(`SIGNUP_WEAK_PASSWORD: signup attempted with email [${email}] and a password with a score of ${score}/4`);
        res.send({ error: 'Your proposed password is too weak.  <a href="https://xkpasswd.net">Consider using this tool to generate a secure, memorable password.</a>' });
        return;
    }
    yield stripe.customers.create({
        source: stripe_token,
        email: email
    })
        .then((cust) => customer = cust)
        .catch((err) => console.log("Customer creation error:\n", (({ code, param, message }) => ({ code, param, message }))(err)));
    if (!customer) {
        console.log(`SIGNUP_STRIPE_CUSTOMER_NOT_CREATED`);
        res.send({ error: "CUSTOMER_NOT_CREATED" });
        return;
    }
    const subscription = yield stripe.subscriptions.create({
        customer: customer.id,
        items: [{ plan: 'plan_DrPVwslmSpiOT4' }]
    }).catch((err) => console.log("Subscription creation error:\n", { code: err.code, param: err.param, message: err.message }));
    if (!subscription) {
        console.log(`SIGNUP_STRIPE_SUBSCRIPTION_NOT_CREATED`);
        stripe.customers.del(customer.id).catch((err) => console.log('Customer deletion error:\n', (({ code, param, message }) => ({ code, param, message }))(err)));
        res.send({ error: "SUBSCRIPTION_NOT_CREATED" });
        return;
    }
    console.log(`SIGNUP_SUCCESSFUL: with username [${email}] and password score ${score}/4`);
    hash = sodium.api.crypto_pwhash_str(Buffer.from(req.body.password), sodium.api.crypto_pwhash_OPSLIMIT_SENSITIVE, sodium.api.crypto_pwhash_MEMLIMIT_INTERACTIVE);
    user_key = generateKey(16);
    res.send();
}));
app.post('/login', function (req, res) {
    const isValid = sodium.api.crypto_pwhash_str_verify(hash, Buffer.from(req.body.password));
    const username = req.body.username;
    if (isValid) {
        const key = Buffer.concat([sibling_key, user_key]);
        const auth = new sodium.Auth(key);
        const valid_until = (Date.now() + token_window).toString();
        const mac = auth.generate(valid_until);
        console.log(`LOGIN_SUCCESSFUL: with username [${username}]`);
        res.send({ valid_until: valid_until, mac: mac.toString('base64') });
    }
    else {
        console.log(`LOGIN_FAILED: with username [${username}]`);
        res.send({ error: 'Login error' });
    }
});
const signup_schema = joi_1.default.object().keys({
    password: joi_1.default.string().required(),
    stripe_token: joi_1.default.string().required(),
    email: joi_1.default.string().email().required()
});
module.exports = app.listen(port, function () {
    console.log(`Example app listening on port ${port}!`);
});
//# sourceMappingURL=app.js.map