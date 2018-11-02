const chai = require('chai');
const chaiHttp = require('chai-http');
const server = require('../dist/app');
const should = chai.should();

chai.use(chaiHttp);

describe('invalid login', function() {
  beforeEach(async function () {
  this.timeout(4000);
  await chai.request(server)
       .post('/signup')
       .send({email: 'justinfrancos@gmail.com', password: 'ifthisislongenoughdictionarywordsarefine', stripe_token: 'tok_visa'});
});
  it('should not return a token', function(done) {
    chai.request(server)
        .post('/login')
        .send({email: 'justinfrancos@gmail.com', password: 'fine'})
        .end(function(err, res) {
          res.body.should.not.include.keys('valid_until', 'mac');
          res.should.have.status(200);
      done();
    });
  });
});


describe('valid login', function() {
  beforeEach(async function () {
  this.timeout(4000);
  await chai.request(server)
       .post('/signup')
       .send({email: 'justinfrancos@gmail.com', password: 'ifthisislongenoughdictionarywordsarefine', stripe_token: 'tok_visa'});
});
  it('should return a token', function(done) {
    chai.request(server)
        .post('/login')
        .send({email: 'justinfrancos@gmail.com', password: 'ifthisislongenoughdictionarywordsarefine'})
  	    .end(function(err, res) {
  	  	  res.body.should.include.keys('valid_until', 'mac');
      	  res.should.have.status(200);
      done();
    });
  });
});