const chai = require("chai");
const chaiHttp = require("chai-http");
const app = require("../dist/app");
const should = chai.should();
const nock = require("nock");
const sinon = require("sinon");
const qs = require("querystring").stringify;
const sodium = require("libsodium-wrappers-sumo");

const email = "justinfrancos@gmail.com";
const password = "ifthisislongenoughdictionarywordsarefine";
const pwhash = "$argon2id$v=19$m=65536,t=4,p=1$VUnpyWRaGSkJRO5So4WfLg$SWBQIezrpoyFN6MNCytfge8enId3FcY/sm/H/Yd+g9U";
const token = "tok_visa_debit";

const server = app.app;

chai.use(chaiHttp);

let users;

before(() => (users = app.getUsers()));

describe("-- SHAPES --", () => {
	describe("- Adding shapes -", () => {
		it("Should return 200", async () => {
			let res;
			// Setup
			await users.insertOne({
					email,
					pwhash,
					rhythMandala: {shapeCapacity: 5, shapes: {}}
			});
			const agent = chai.request.agent(server);

			await agent
				.post("/login")
				.send({email, password});
				await agent
					.post("/set-shape")
					.send({name: "hello", shape: {shapes: [{"color":"#00ff00","cycle":6,"subdivisions":[1,2,3,4,5,6]},{"color":"#0000ff","cycle":6,"subdivisions":[1,3,5]} ], frameColor: "black"}})
await agent
				.post("/set-shape")
				.send({name: "hellof", shape: {shapes: [{"color":"#00ffff","cycle":6,"subdivisions":[1,2,3,4,5,6]},{"color":"#0000ff","cycle":6,"subdivisions":[1,3,5]} ], frameColor: "black"}})
await agent
				.post("/set-shape")
				.send({name: "hellov", shape: {shapes: [{"color":"#00ffff","cycle":6,"subdivisions":[1,2,3,4,5,6]},{"color":"#0000ff","cycle":6,"subdivisions":[1,3,5]} ], frameColor: "black"}})
await agent
				.post("/set-shape")
				.send({name: "helloc", shape: {shapes: [{"color":"#00ffff","cycle":6,"subdivisions":[1,2,3,4,5,6]},{"color":"#0000ff","cycle":6,"subdivisions":[1,3,5]} ], frameColor: "black"}})
await agent
				.post("/set-shape")
				.send({name: "hellod", shape: {shapes: [{"color":"#00ffff","cycle":6,"subdivisions":[1,2,3,4,5,6]},{"color":"#0000ff","cycle":6,"subdivisions":[1,3,5]} ], frameColor: "black"}})
res = await agent
				.post("/set-shape")
				.send({name: "hellog", shape: {shapes: [{"color":"#00ffff","cycle":6,"subdivisions":[1,2,3,4,5,6]},{"color":"#0000ff","cycle":6,"subdivisions":[1,3,5]} ], frameColor: "black"}})
				res.should.have.status(400);
res = await agent
				.post("/set-shape")
				.send({name: "hellod", shape: {shapes: [{"color":"#00fffwefweff","cycle":6,"subdivisions":[1,2,3,4,5,6]},{"color":"#0000ff","cycle":6,"subdivisions":[1,3,5]} ], frameColor: "black"}})
				res.should.have.status(200);
				await agent
					.post("/unset-shape")
					.send({name: "hellof"})
				res = await agent
					.post("/get-pdf")
					.send({name: "hello"});
				console.log(res.body);
			// await users.drop();
			agent.close();
		});
	});	
});
