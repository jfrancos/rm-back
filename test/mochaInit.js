// This gets called from mocha.opts

const app = require("../dist/app");
const mongodb = require("mongodb");
const ngrok = require("ngrok");
require("dotenv").config;

before(async () => {
  process.removeAllListeners("uncaughtException");
  process.removeAllListeners("unhandledRejection");
  let mongoClient;
    mongoClient = await mongodb.connect(
      process.env.MONGODB_URI,
      { useNewUrlParser: true }
    );

  // console.log(mongoClient.db().listCollections());

  const sessions = mongoClient.db().collection("sessions");
  sessions && sessions.drop();
  const users = mongoClient.db().collection("users");
  users && users.drop();
  let url;
  try {
    url = await ngrok.connect(process.env.PORT);
  } catch (err) {
    console.log(err);
  }
  console.log("url", url);
  await app.startServer(url);
});

after(async () => {
  // Heroku will call SIGTERM every day so let's test it out!
  setImmediate(() => {
    // otherwise we might kill before stack traces are printed
    process.kill(process.pid, "SIGTERM");
  });
});
