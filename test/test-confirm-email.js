const chai = require("chai");
const chaiHttp = require("chai-http");
const app = require("../dist/app")
const should = chai.should();
const nock = require("nock");
const qs = require("querystring").stringify;
const sodium = require('libsodium-wrappers-sumo');
const email = "justinfrancos@gmail.com";
const password = "ifthisislongenoughdictionarywordsarefine";
const token = "tok_visa_debit";

const server = app.app;

chai.use(chaiHttp);

let users;
before (async function () {
	this.timeout(100000);
	await sodium.ready;
	users = app.getUsers()
}); // This depends on mochaInit.js to work

const handleError = res =>
	console.log(`MOCHA/CHAI: ${res.body.code}: ${res.body.message}`);

describe("--- TESTING EMAIL CONFIRMATION ---", () => {
	describe("-- Confirming a newly created account with correct parameters --", () => {
		it("Should remove the email confirmation field and return a token", async () => {
			// Setup
			await users.insertOne({
				email: "justinfrancos@gmail.com",
				confirmation_key: "confirmation_key",
				signing_key: Buffer.from (sodium.crypto_auth_keygen())
			});

			// Exercise
			res = await chai
				.request(server)
				.post("/confirm_email")
				.send({ key: "confirmation_key", email: email });

			// Verify
			const user = await users.findOne({
				email: "justinfrancos@gmail.com"
			});
			res.should.have.status(200);
			user.should.not.contain.key("confirmation_key");
			res.body.should.include.keys("mac", "valid_until");

			// Teardown
			users.drop();
		});
	});
});
