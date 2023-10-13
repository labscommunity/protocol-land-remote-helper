"use strict";
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
var child_process_1 = require("child_process");
var path = require("path");
var PUSHED_OK_MSG = "Setting pushed to 1";
var pushed = false;
var bashScriptPath = "proland-helper"; // should be on the PATH like this scriptts
var tmp_path = process.env.REPO_TMP
    ? process.env.REPO_TMP
    : path.join(process.env.HOME, "coding", "grh", "remotes");
var args = process.argv.slice(2, 4); // only use 2 parametes (remote name and repo url)
var bashProcess = (0, child_process_1.spawn)("bash", __spreadArray(__spreadArray([bashScriptPath], args, true), [tmp_path], false), {
    stdio: ["pipe", "pipe", "pipe"], // Pipe for stdin, stdout, and stderr
});
// Pipe data from process.stdin to child.stdin
process.stdin.pipe(bashProcess.stdin);
// Pipe data from child.stdout to process.stdout
bashProcess.stdout.pipe(process.stdout);
// Handle stderr data
bashProcess.stderr.on("data", function (data) {
    var errorOutput = data.toString();
    // Process error output here
    process.stderr.write(errorOutput);
    if (errorOutput.includes(PUSHED_OK_MSG))
        pushed = true;
});
// Handle process exit
bashProcess.on("exit", function (code) {
    if (code === 0) {
        console.error("Bash script executed successfully. pushed = ".concat(pushed, "."));
    }
    else {
        console.error("Bash script exited with code ".concat(code, "."));
    }
});
