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
const axios = require("axios").default;

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
      let bureaus = rows.map((row) => {
        let bureau = {
          bureauId: row[0].toString(),
          name: row[1],
          email: row[2],
          department: row[3],
          publicKey: row[4],
        };
        return bureau;
      });

      // prepare data fit to interface
      const profilesOnBkc = bureaus.map((bureau) => ({ ...bureau, email: null }));
      // send to bkc
      const response = await createBureauOnBlockchain(req.body.privateKeyHex, profilesOnBkc);
      if (response.ok) {
        // create pw
        bureaus = bureaus.map((bureau) => {
          let randomPassword = generator.generate({ length: 8, numbers: true });
          bureau.firstTimePassword = randomPassword;
          const salt = bcrypt.genSaltSync();
          let hashedPassword = bcrypt.hashSync(randomPassword, salt);
          bureau.hashedPassword = hashedPassword;
          bureau.role = ROLE.BUREAU;
          return bureau;
        });
        // create accounts
        // TODO: check if emails exits
        const accounts = bureaus.map((bureau) => ({ email: bureau.email, hashedPassword: bureau.hashedPassword, role: bureau.role }));
        const insertedIds = (await accCol.insertMany(accounts)).insertedIds;
        const txids = response.txids;
        const profiles = bureaus.map((bureau, index) => ({ ...bureau, uid: insertedIds[index], txid: txids[index] }));
        // create history
        const insertbureauHistoryResult = await bureauHistoryCol.insertOne({
          time: new Date().toISOString().split("T")[0],
          profiles: profiles,
          uid: req.user.uid,
        });
        res.json(insertbureauHistoryResult.ops[0]);
      } else {
        res.status(502).json({ msg: "Không thể tạo các transaction, vui lòng thử lại sau: " + response.msg });
      }
    });
  } catch (error) {
    res.status(500).json(error.toString());
  }
});

// Talk to sawtooth-cli
async function createBureauOnBlockchain(privateKeyHex, profiles) {
  // const res = await axios.post("/create_teacher", { privateKeyHex, profiles });
  // return res.data;
  const txids = profiles.map((profile, index) => "7968acaae3dbda81a951f631bfd2" + index);
  return { ok: true, txids };
}

router.get("/bureau-history", authen, author(ROLE.STAFF), async (req, res) => {
  try {
    const bureauHistoryCol = (await connection).db().collection("BureauHistory");
    const result = await bureauHistoryCol.find({ uid: req.user.uid }).toArray();
    res.json(result);
  } catch (error) {
    res.status(500).json(error.toString());
  }
});

module.exports = router;
