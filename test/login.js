const chai = require("chai");
const chaiHttp = require("chai-http");
const app = require("../dist/app");
const should = chai.should();
const nock = require("nock");
const sinon = require("sinon");
const qs = require("querystring").stringify;

const email = "justinfrancos@gmail.com";
const password = "ifthisislongenoughdictionarywordsarefine";
const token = "tok_visa_debit";
const pwhash = "$argon2id$v=19$m=65536,t=4,p=1$VUnpyWRaGSkJRO5So4WfLg$SWBQIezrpoyFN6MNCytfge8enId3FcY/sm/H/Yd+g9U";


const server = app.app;
const twoWeeks = 1209600000;

chai.use(chaiHttp);

process.on("uncaughtException", err => {
	fs.writeSync(1, `Caught exception: ${err}\n`);
});

let users;

before(() => (users = app.getUsers())); // This depends on mochaInit.js to work

describe("-- Login --", () => {
	describe("- Successful login -", () => {
		it("Should return 200", async () => {

			// Setup
			await users.insertOne({
					email,
					pwhash,
				});

			const agent = chai.request.agent(server);
			let res = await agent
				.post("/new-session/login")
				.send({ email, password });
			res.should.have.status(200);
			// console.log(JSON.stringify(res, null, 4));
			res.should.have.cookie('connect.sid')

			// res = await agent.post("/session/get_user");

			users.drop();
			agent.close();
		});
	});	
	describe("- Login with bad password -", () => {
		it("Should return 400", async () => {

			// Setup
			await users.insertOne({
				email,
				pwhash,
			});
			const agent = chai.request.agent(server);

			let res = await agent
				.post("/new-session/login")
				.send({ email, password: 'badpassword' });
			res.should.have.status(400);
			res.should.not.have.cookie('connect.sid')

			users.drop();
			agent.close();
		});
	});
	describe("- Login with bad username -", () => {
		it("Should return 400", async () => {

			// Setup
			await users.insertOne({
				email,
				pwhash,
			});
			const agent = chai.request.agent(server);

			let res = await agent
				.post("/new-session/login")
				.send({ email: 'bad@username.com', password });
			res.should.have.status(400);
			res.should.not.have.cookie('connect.sid')

			users.drop();
			agent.close();
		});
	});
	describe("- Login unconfirmed account -", () => {
		it("Should return error", async () => {

			// Setup
			await users.insertOne({
					email,
					confirmationKey: "confirmation_key",
					pwhash,
				});

			const agent = chai.request.agent(server);
			let res = await agent
				.post("/new-session/login")
				.send({ email, password });
			res.should.have.status(400);
			res.should.not.have.cookie('connect.sid')

			users.drop();
			agent.close();
		});
	});
	// describe("- Get user after cookie expires -", () => {
	// 	it("Should not return user", async () => {
	// 		// Setup
	// 		const clock = sinon.useFakeTimers((new Date()).getTime() - twoWeeks - 1000);
	// 		const agent = chai.request.agent(server);
	// 		let res = await agent
	// 			.post("/new-session/signup")
	// 			.send({ email, password, source: token });

	// 		const user = await users.findOne({ email });
	// 		const key = user.confirmationKey;
	// 		res = await agent.post("/confirm_email").send({ key, email });
	// 		console.log('here')

	// 		clock.restore();
	// 		console.log('there')

	// 		res = await agent.post("/session/get_user");
	// 		res.should.have.status(401);

	// 		users.drop();
	// 		agent.close();
	// 	}).timeout(6000);
	// });
	// describe("- Willy nilly call get_user -", () => {
	// 	it("Should not return user", async () => {
	// 		// Setup
	// 		const agent = chai.request.agent(server);

	// 		res = await agent.post("/session/get_user");
	// 		res.should.have.status(401);

	// 		console.log(res.body);
	// 		users.drop();
	// 		agent.close();
	// 	}).timeout(6000);
	// });
});
