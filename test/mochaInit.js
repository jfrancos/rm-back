// This gets called from mocha.opts

const app = require("../dist/app");
const mongodb = require("mongodb");
const ngrok = require("ngrok");
require("dotenv").config;

before(async () => {
  const mongoClient = await mongodb.connect(
    process.env.MONGODB_URI,
    { useNewUrlParser: true }
  );
  // process.removeAllListeners("uncaughtException");
  // process.removeAllListeners("unhandledRejection");
  mongoClient
    .db()
    .collection("sessions")
    .drop();
  mongoClient
    .db()
    .collection("users")
    .drop();
  url = await ngrok.connect(process.env.PORT);
  await app.startServer(url);
});

after(async () => {
  // Heroku will call SIGTERM every day so let's test it out!
  process.kill(process.pid, "SIGTERM");
});
