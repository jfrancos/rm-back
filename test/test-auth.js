const chai = require('chai');
const chaiHttp = require('chai-http');
const server = require('../app');
const should = chai.should();
const sinon = require('sinon');

chai.use(chaiHttp);


describe('sending auth token', function() {
	let answer;
	let clock;
	before(async function () {
		clock = sinon.useFakeTimers();
		await chai.request(server)
		.post('/signup')
		.send({username: 'justinfrancos@gmail.com', password: 'ifthisislongenoughdictionarywordsarefine'});
		await chai.request(server)
		.post('/login')
		.send({username: 'justinfrancos@gmail.com', password: 'ifthisislongenoughdictionarywordsarefine'})
		.then(function(res) {
			answer = res.body;
		});
	});
	describe('before timeout', function() {
		it('results in another auth token', function(done) {
			clock.tick(50000);
			chai.request(server)
			.post('/auth/test')
			.send({mac: answer.mac, valid_until: answer.valid_until})
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
			.send({mac: answer.mac, valid_until: answer.valid_until})
			.end(function(err, res) {
				res.body.should.not.include.keys('valid_until', 'mac');
				res.body.should.include.key('error');
				res.should.have.status(200);
				done();
			});
		});
	});
	after(function () {
		clock.restore();
	});
});
