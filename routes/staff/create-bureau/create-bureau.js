const express = require("express");
const router = express.Router();
const multer = require("multer");
const upload = multer();
const readXlsxFile = require("read-excel-file/node");
const { authen, author } = require("../../acc/protect-middleware");
const connection = require("../../../db");
const generator = require("generate-password");
const bcrypt = require("bcryptjs");
const { ROLE } = require("../../acc/ROLE");

const { Duplex } = require("stream");
function bufferToStream(myBuuffer) {
  let tmp = new Duplex();
  tmp.push(myBuuffer);
  tmp.push(null);
  return tmp;
}

router.post("/create-bureau", authen, author(ROLE.STAFF), upload.single("excel-file"), async (req, res) => {
  try {
    const accCol = (await connection).db().collection("Account");
    const bureauHistoryCol = (await connection).db().collection("BureauHistory");
    readXlsxFile(bufferToStream(req.file.buffer)).then(async (rows) => {
      // skip header
      rows.shift();
      // parse excel
      const bureaus = rows.map((row) => {
        let bureau = {
          bureauId: row[0].toString(),
          name: row[1],
          email: row[2],
          department: row[3],
          publicKey: row[4],
        };
        // create pw
        let randomPassword = generator.generate({ length: 8, numbers: true });
        bureau.firstTimePassword = randomPassword;
        const salt = bcrypt.genSaltSync();
        let hashedPassword = bcrypt.hashSync(randomPassword, salt);
        bureau.hashedPassword = hashedPassword;
        return bureau;
      });
      // TODO: send public key of bureau to cli to make txs, then add txid, address, timestamp to bureau object -> insert to db!
      // const opResponse = await createBureauOnBlockchain(req.body.privateKeyHex, profiles);
      // if (opResponse.ok) {
      //   // get array of txid, adresss, timstamp, ...
      // } else {
      //   res.json(opResponse);
      // }
      const accounts = bureaus.map((bureau) => ({ email: bureau.email, hashedPassword: bureau.hashedPassword, role: ROLE.BUREAU }));
      const insertedIds = (await accCol.insertMany(accounts)).insertedIds;
      const profiles = bureaus.map((bureau, index) => ({ ...bureau, uid: insertedIds[index] }));
      const insertbureauHistoryResult = await bureauHistoryCol.insertOne({ time: new Date().toISOString().split("T")[0], profiles: profiles });
      res.json(insertbureauHistoryResult.ops[0]);
    });
  } catch (error) {
    res.status(500).json(error.toString());
  }
});

// Talk to sawtooth-cli
async function createBureauOnBlockchain(privateKeyHex, bureausJson) {
  return Promise.resolve({ ok: true });
}

router.get("/bureau-history", authen, author(ROLE.STAFF), async (req, res) => {
  try {
    const bureauHistoryCol = (await connection).db().collection("BureauHistory");
    const result = await bureauHistoryCol.find({}).toArray();
    res.json(result);
  } catch (error) {
    res.status(500).json(error.toString());
  }
});

module.exports = router;
