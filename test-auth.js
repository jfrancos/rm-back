const chai = require('chai');
const chaiHttp = require('chai-http');
const server = require('../dist/app').app;
const should = chai.should();
const sinon = require('sinon');

chai.use(chaiHttp);


describe('sending auth token', function() {
	this.timeout(6000);
	let answer;
	let clock;
	beforeEach(function () {
		clock = sinon.useFakeTimers();
	});
	before(async function () {
		clock = sinon.useFakeTimers();
		await chai.request(server)
		.post('/signup')
		.send({email: 'justinfrancos@gmail.com', password: 'ifthisislongenoughdictionarywordsarefine', source: 'tok_visa'});
		await chai.request(server)
		.post('/login')
		.send({email: 'justinfrancos@gmail.com', password: 'ifthisislongenoughdictionarywordsarefine'})
		.then(function(res) {
			answer = res.body;
		});
	});
	describe('before timeout', function() {
		it('results in another auth token', function(done) {
			clock.tick(50000);
			chai.request(server)
			.post('/auth/test')
			.send({email: 'justinfrancos@gmail.com', mac: answer.mac, valid_until: answer.valid_until})
			.end(function(err, res) {
				res.body.should.include.keys('valid_until', 'mac');
				res.should.have.status(200);
				done();
			});
		});
	});
	describe('after timeout', function() {
		it('responds with error', function(done) {
			clock.tick(70000);
			chai.request(server)
			.post('/auth/test')
			.send({email: 'justinfrancos@gmail.com', mac: answer.mac, valid_until: answer.valid_until})
			.end(function(err, res) {
				res.body.should.not.include.keys('valid_until', 'mac');
				res.body.should.include.key('error');
				res.should.have.status(200);
				done();
			});
		});
	});
	describe('and then refreshing auth key', function() {
		beforeEach(async function() {
			await chai.request(server)
			.post('/auth/refresh_auth_key')
			.send({email: 'justinfrancos@gmail.com', mac: answer.mac, valid_until: answer.valid_until});
		});
		it('does not accept mac+valid_until', function(done) {
			chai.request(server)
			.post('/auth/test')
			.send({email: 'justinfrancos@gmail.com', mac: answer.mac, valid_until: answer.valid_until})
			.end(function(err, res) {
				res.body.should.not.include.keys('valid_until', 'mac');
				res.body.should.include.key('error');
				res.should.have.status(200);
				done();
			});
		})
	})
	afterEach(function () {
		clock.restore();
	});
});
