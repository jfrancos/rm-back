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

// process.on('uncaughtException', (err) => {
//   fs.writeSync(1, `Caught exception: ${err}\n`);
// });

const confirmEmail = "/new-session/confirm_email"
const signup = "/signup"

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

describe("--- TESTING RHYTHMANDALA-SPECIFIC ENDPOINTS ---", () => {
	describe("-- Buying a 5 pack --", () => {
		it("Should return 200", async () => {
			// Setup
			const agent = chai.request.agent(server);
			await agent
				.post(signup)
				.send({ email, password, source: token });
			let user = await users.findOne({ email });
			const key = user.confirmationKey;

			// Exercise
			let res = await agent   /// had await but i think that causes issues
				.post(confirmEmail)
				.send({ key, email });

			console.log('confirmed')
			user = await users.findOne({ email });
			if (user.rmMonthlyPrints != 5) {
				// Wait for Stripe Webhooks to arrive
				console.log('Awaiting subscription via webhook')
				await new Promise(resolve => {
					const stream = users.watch()
					stream.on('change', async data => {
						user = await users.findOne({ email });
			 			if (user.rmMonthlyPrints === 5) {
							resolve();
							stream.close(); // does this unwatch the stream??
						}
					});
				});
			}

			await agent.post("/session/purchase_five_pack");
			await agent.post("/session/purchase_five_pack");

			user = await users.findOne({ email });

			// Verify
			res.should.have.status(200);
			user.should.have.property("rmMonthlyPrints", 5);
			user.should.have.property("rmExtraPrints", 10);
			user.should.have.property("rmShapeCapacity", 15);

			// Teardown
			await users.drop();
			agent.close();
		}).timeout(30000);
	});
});
