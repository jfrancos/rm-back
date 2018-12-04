const chai = require("chai");
const chaiHttp = require("chai-http");
const app = require("../dist/app");
const should = chai.should();
const nock = require("nock");
const qs = require("querystring").stringify;
const sodium = require("libsodium-wrappers-sumo");
const sinon = require("sinon");
const sinonChai = require("sinon-chai");

const email = "justinfrancos@gmail.com";
const password = "ifthisislongenoughdictionarywordsarefine";
const token = "tok_visa_debit";



process.on('uncaughtException', (err) => {
  fs.writeSync(1, `Caught exception: ${err}\n`);
});

const server = app.app;

chai.use(chaiHttp);
chai.use(sinonChai);

let users, ngrokUrl;
before(async () => {
	await sodium.ready;
	users = app.getUsers();
	//  users = app.users;

}); // This depends on mochaInit.js to work

const handleError = res =>
	console.log(`MOCHA/CHAI: ${res.body.code}: ${res.body.message}`);

describe("--- TESTING EMAIL CONFIRMATION ---", () => {
		describe("-- Confirming an account with email that doesn't exist --", () => {
			it("Should return 400 with code: EmailConfirmationError", async () => {
				// Setup
				await users.insertOne({
					email: "justinfrancos@gmail.com",
					confirmation_key: "confirmation_key",
					signing_key: Buffer.from(sodium.crypto_auth_keygen())
				});
				const spy = sinon.spy(console, "log");

				// Exercise
				const res = await chai
					.request(server)
					.post("/confirm_email")
					.send({ key: "confirmation_key", email: "asdf@asdf.com" });

				// Verify
				const user = await users.findOne({ email });
				user.should.contain.key("confirmation_key");
				res.should.have.status(400);
				spy.should.have.been.calledWithMatch("MissingUserError");
				res.body.should.have.property("code", "EmailConfirmationError");

				// Teardown
				try {
					await users.drop();
				} catch (err) {
					console.log(err)
				}
				console.log.restore();
			});
		});

		describe("-- Confirming an account with a user that already confirmed --", () => {
			it("Should return 400 with code: EmailConfirmationError", async () => {
				// Setup
				await users.insertOne({
					email: "justinfrancos@gmail.com"
					//				signing_key: Buffer.from (sodium.crypto_auth_keygen())
				});
				const spy = sinon.spy(console, "log");

				// Exercise
				const res = await chai
					.request(server)
					.post("/confirm_email")
					.send({ key: "confirmation_key", email: "asdf@asdf.com" });

				// Verify
				const user = await users.findOne({ email });
				user.should.not.contain.key("confirmation_key");
				res.body.should.have.property("code", "EmailConfirmationError");
				res.should.have.status(400);
				spy.should.have.been.calledWithMatch("MissingUserError");

				// Teardown
				try {
					await users.drop();
				} catch (err) {
					console.log(err)
				}
				console.log.restore();
			});
		});

		describe("-- Confirming an account with incorrect key --", () => {
			it("Should return 400 with code: ConfirmationKeyError", async () => {
				// Setup
				await users.insertOne({
					email: "justinfrancos@gmail.com",
					confirmation_key: "confirmation_key",
					signing_key: Buffer.from(sodium.crypto_auth_keygen()),
					monthly_prints: 0
				});
				const spy = sinon.spy(console, "log");

				// Exercise
				const res = await chai
					.request(server)
					.post("/confirm_email")
					.send({ key: "confirmation_notkey", email });

				// Verify
				const user = await users.findOne({ email });
				user.should.contain.key("confirmation_key");
				res.should.have.status(400);
				spy.should.have.been.calledWithMatch("ConfirmationKeyError");
				res.body.should.have.property("code", "EmailConfirmationError");
				user.should.have.property("monthly_prints", 0);

				// Teardown
				await users.drop();
				console.log.restore();
			});
		});

	describe("-- Confirming a newly created account with valid parameters --", () => {
		it("Should return 200", async () => {
			// Setup
			await chai
				.request(server)
				.post("/user/signup")
				.send({ email, password, source: token });
			let user = await users.findOne({ email });
			const key = user.confirmation_key;
			//const spy = sinon.spy(app.handleStripeWebhook);

			// Exercise
			const res = await chai   /// had await but i think that causes issues
				.request(server)
				.post("/confirm_email")
				.send({ key, email });

			console.log('confirmed')
			user = await users.findOne({ email });
			if (user.monthly_prints != 5) {
				// Wait for Stripe Webhooks to arrive
				console.log('Awaiting subscription via webhook')
				await new Promise(resolve => {
					const stream = users.watch()
					stream.on('change', async data => {
						user = await users.findOne({ email });
			 			if (user.monthly_prints === 5) {
							resolve();
							stream.close(); // does this unwatch the stream??
						}
					});
				});
			}

			// Verify
			res.should.have.status(200);
			user.should.not.contain.key("confirmation_key");
			user.should.have.property("monthly_prints", 5);

			// Teardown
			await users.drop();
		}).timeout(30000);
	});

	// describe("timing test", () => {
	// 	it ('asdf', async () => {
	// 		await new Promise(resolve =>
	// 			setTimeout(resolve, 3000)
	// 		);
	// 		after(async () => {
	// 			await new Promise(resolve =>
	// 				setTimeout(resolve, 2000)
	// 			);
	// 		});
	// 	}).timeout(4000);
	// })

	describe("-- Confirming a newly created account with tok_chargeCustomerFail --", () => {
		it("Should return 200", async () => {
			// Setup
			// email = "asdf@asdf.com";
			await chai
				.request(server)
				.post("/user/signup")
				.send({ email, password, source: "tok_chargeCustomerFail" });
			let user = await users.findOne({ email });
			const key = user.confirmation_key;

			// Exercise
			const res = await chai
				.request(server)
				.post("/confirm_email")
				.send({ key, email });

			// Verify
			user = await users.findOne({ email });
			res.should.have.status(200);
			user.should.not.contain.key("confirmation_key");

			// Teardown
			await users.drop();
		}).timeout(10000);
	});

	describe("-- Confirming a newly created account with bad stripe_id --", () => {
		it("Should return 200", async () => { // why would i even make this a test?
			// Setup
			await users.insertOne({
				email,
				confirmation_key: "confirmation_key",
				stripe_id: "asdf",
				current_period_end: 0,
				signing_key: Buffer.from(sodium.crypto_auth_keygen())
			});

			// Exercise
			const res = await chai
				.request(server)
				.post("/confirm_email")
				.send({ key: "confirmation_key", email });

			// Verify
			const user = await users.findOne({ email });
			res.should.have.status(200);
			user.should.not.contain.key("confirmation_key");

			// Teardown
			await users.drop();
		});
	});
});
