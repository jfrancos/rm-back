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

const confirmEmail = "/new-session/confirm_email";
const signup = "/signup";
const logout = "/logout";
const login = "/login";

const server = app.app;

chai.use(chaiHttp);
chai.use(sinonChai);

let users;
before(async () => {
	users = app.getUsers();
}); // This depends on mochaInit.js to work

const handleError = res =>
	console.log(`MOCHA/CHAI: ${res.body.code}: ${res.body.message}`);

describe("--- TESTING RHYTHMANDALA-SPECIFIC ENDPOINTS ---", () => {
	before(async () => {
		const spy = sinon.spy(sodium, "crypto_pwhash_str");
		const agent = chai.request.agent(server);
		await agent
			.post(signup)
			.send({ email, password, source: token });
		let user = await users.findOne({ email });
		await agent
			.post(signup)
			.send({ email: "adsf@asdf.com", password: "4%@#ggfwEFfewafvvre", source: token });
		const key = spy.args[1][0];
		res = await agent
			.post(confirmEmail)
			.send({ key, email });
		res = await agent
			.post("/session/logout");
		console.log(res.body);
		user = await users.findOne({ email });
	});
	describe("-- Buying a 5 pack --", () => {
		it("Should return 200", async () => {
			// Setup
			const agent = chai.request.agent(server);
			let res = await agent
				.post("/new-session/login")
				.send({ email, password });
			await agent.post("/session/purchase_five_pack");
			res = await agent.post("/session/purchase_five_pack");

			user = await users.findOne({ email });

			// Verify
			res.should.have.status(200);
			user.should.have.property("rmMonthlyPrints", 5);
			user.should.have.property("rmExtraPrints", 10);
			user.should.have.property("rmShapeCapacity", 15);

			// Teardown
			res = await agent
				.post("/session/logout");
			agent.close();
		});
	});
	describe("-- Changing source --", () => {
		it("Should return 200", async () => {
			// Setup
			const agent = chai.request.agent(server);
			await agent.post("/new-session/login").send({ email, password });
			user = await users.findOne({ email });
			const res = await agent
				.post("/session/update-source")
				.send({ source: "tok_visa" });
			user = await users.findOne({ email });

			// Verify
			res.should.have.status(200);

			// Teardown
			agent.close();
		});
	});
	describe("-- Cancelling subscription --", () => {
		it("Should return 200", async () => {
			// Setup
			const agent = chai.request.agent(server);
			await agent.post("/new-session/login").send({ email, password });
			user = await users.findOne({ email });
			const res = await agent.post("/session/cancel-subscription");
			user = await users.findOne({ email });

			// Verify
			res.should.have.status(200);

			// Teardown
			agent.close();
		});
	});
	after(async () => {
		await users.drop();
	});
});
