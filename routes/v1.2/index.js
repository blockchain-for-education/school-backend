const express = require("express");
const router = express.Router();

router.use("/acc", require("./acc"));
router.use("/staff", require("./staff"));
router.use("/teacher", require("./teacher"));
router.use("/student", require("./student"));

module.exports = router;
