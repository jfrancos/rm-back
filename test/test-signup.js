const chai = require('chai');
const chaiHttp = require('chai-http');
const server = require('../app');
const should = chai.should();

//console.log(server);

chai.use(chaiHttp);

describe('signup', function() {
  describe('with weak password', function() {
    it('should return an error', function(done) {
    	chai.request(server)
    	  .post('/signup')
    	  .send({username: 'justinfrancos@gmail.com', password: 'my password'})
    	  .end(function(err, res) {
    	  	res.body.should.include.key('error');
        	res.should.have.status(200);
        done();
      });
    });
  });
  describe('with valid parameters', function() {
  it('should return 200', function(done) {
    chai.request(server)
      .post('/signup')
      .send({username: 'jfrancos', password: 'ifthisislongenoughdictionarywordsarefine'})
      .end(function(err, res) {
        res.body.should.not.include.key('error');
        res.should.have.status(200);
      done();
    });
  });
});
});

