var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var _this = this;
//const Reflect = require("reflect-metadata");
//import 'reflect-metadata';
var bodyParser = require('body-parser');
var express = require('express');
var helmet = require('helmet');
var joi = require('joi');
var mailgun = require('mailgun-js');
var sodium = require('sodium');
var sodium_api = require('sodium').api;
var stripe = require("stripe")("sk_test_4vUzfLsfzZ7ffojQgISR1ntd");
var zxcvbn = require('zxcvbn');
var generateKey = function (len) {
    var key = Buffer.allocUnsafe(len);
    sodium_api.randombytes_buf(key, len);
    return key;
};
var generateTokenDict = function () {
    var key = Buffer.concat([sibling_key, user_key]);
    var auth = new sodium.Auth(key);
    var valid_until = (Date.now() + token_window).toString();
    var mac = auth.generate(valid_until).toString('base64');
    return ({ mac: mac, valid_until: valid_until });
};
var token_window = 60000;
var port = process.env.PORT || 3000;
var app = express();
var plan = 'plan_DrPVwslmSpiOT4';
var sibling_key = generateKey(16);
app.use(helmet());
app.use(bodyParser.json());
var hash, user_key;
app.use('/auth', function (req, res, next) {
    var key = Buffer.concat([sibling_key, user_key]);
    var auth = new sodium.Auth(key);
    var mac = Buffer.from(req.body.mac, 'base64');
    var valid_until = req.body.valid_until;
    var isValid = auth.validate(mac, valid_until);
    if (!isValid || (Date.now() > parseInt(valid_until))) {
        res.send({ error: 'invalid' });
    }
    else {
        next();
    }
});
app.post('/auth/delete', function (req, res) {
    stripe.customers.del(customer.id)["catch"](function (err) { return console.log('Customer deletion error:\n', (function (_a) {
        var rawType = _a.rawType, code = _a.code, param = _a.param, message = _a.message, detail = _a.detail;
        return ({ rawType: rawType, code: code, param: param, message: message, detail: detail });
    })(err)); });
    res.send();
});
app.post('/auth/test', function (req, res) {
    res.send(generateTokenDict());
});
app.post('/auth/refresh_auth_key', function (req, res) {
    user_key = generateKey(16);
    res.send({ message: 'invalid' });
});
app.post('/signup', function (req, res) { return __awaiter(_this, void 0, void 0, function () {
    var email, password, stripe_token, score, customer, subscription;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                validation = signup_schema.validate(req.body);
                if (validation.error) {
                    console.log('validation error', validation.error.details[0].message);
                    res.send({ error: 'validation_error' });
                    return [2 /*return*/];
                }
                email = req.body.email;
                password = req.body.password;
                stripe_token = req.body.stripe_token;
                score = zxcvbn(req.body.password).score;
                if (score < 3) {
                    console.log("SIGNUP_WEAK_PASSWORD: signup attempted with email [" + email + "] and a password with a score of " + score + "/4");
                    res.send({ error: 'Your proposed password is too weak.  <a href="https://xkpasswd.net">Consider using this tool to generate a secure, memorable password.</a>' });
                    return [2 /*return*/];
                }
                return [4 /*yield*/, stripe.customers.create({
                        source: stripe_token,
                        email: email
                    })["catch"](function (err) { return console.log("Customer creation error:\n", (function (_a) {
                        var rawType = _a.rawType, code = _a.code, param = _a.param, message = _a.message, detail = _a.detail;
                        return ({ rawType: rawType, code: code, param: param, message: message, detail: detail });
                    })(err)); })];
            case 1:
                customer = _a.sent();
                if (!customer) {
                    console.log("SIGNUP_STRIPE_CUSTOMER_NOT_CREATED");
                    res.send({ error: "CUSTOMER_NOT_CREATED" });
                    return [2 /*return*/];
                }
                return [4 /*yield*/, stripe.subscriptions.create({
                        customer: customer.id,
                        items: [{
                                plan: 'plan_DrPVwslmSpiOT4'
                            },]
                    })["catch"](function (err) { return console.log("Subscription creation error:\n", { rawType: err.rawType, code: err.code, param: err.param, message: err.message, detail: err.detail }); })];
            case 2:
                subscription = _a.sent();
                if (!subscription) {
                    console.log("SIGNUP_STRIPE_SUBSCRIPTION_NOT_CREATED");
                    stripe.customers.del(customer.id)["catch"](function (err) { return console.log('Customer deletion error:\n', (function (_a) {
                        var rawType = _a.rawType, code = _a.code, param = _a.param, message = _a.message, detail = _a.detail;
                        return ({ rawType: rawType, code: code, param: param, message: message, detail: detail });
                    })(err)); });
                    res.send({ error: "SUBSCRIPTION_NOT_CREATED" });
                    return [2 /*return*/];
                }
                console.log("SIGNUP_SUCCESSFUL: with username [" + email + "] and password score " + score + "/4");
                hash = sodium_api.crypto_pwhash_str(Buffer.from(req.body.password), sodium_api.crypto_pwhash_OPSLIMIT_SENSITIVE, sodium_api.crypto_pwhash_MEMLIMIT_INTERACTIVE);
                user_key = generateKey(16);
                res.send();
                return [2 /*return*/];
        }
    });
}); });
app.post('/login', function (req, res) {
    var isValid = sodium_api.crypto_pwhash_str_verify(hash, Buffer.from(req.body.password));
    var username = req.body.username;
    if (isValid) {
        var key = Buffer.concat([sibling_key, user_key]);
        var auth = new sodium.Auth(key);
        var valid_until = (Date.now() + token_window).toString();
        var mac = auth.generate(valid_until);
        console.log("LOGIN_SUCCESSFUL: with username [" + username + "]");
        res.send({ valid_until: valid_until, mac: mac.toString('base64') });
    }
    else {
        console.log("LOGIN_FAILED: with username [" + username + "]");
        res.send({ error: 'Login error' });
    }
});
var signup_schema = joi.object().keys({
    password: joi.string().required(),
    stripe_token: joi.string().required(),
    email: joi.string().email().required()
});
module.exports = app.listen(port, function () {
    console.log("Example app listening on port " + port + "!");
});
