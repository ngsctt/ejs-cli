var fs = require('fs');
var path = require('path');

var yargs = require('yargs');
var colors = require('colors');
var async = require('async');
var ejs = require('ejs');
var glob = require('glob');
var mkdirp = require('mkdirp');

var fetchStdio = require(__dirname + '/fetchStdio');
var parseOptionsFile = require(__dirname + '/parseOptionsFile');

(function () {
    var argv = yargs(process.argv.slice(2))
      .usage('Usage: $0 [options] [file path]')

      .help('h')
      .alias('h', 'help')
      .describe('h', 'show this help.')

      .string('f')
      .alias('f', 'file')
      .describe('f', 'give ejs template file path.')

      .string('b')
      .alias('b', 'base-dir')
      .default('b', './')
      .describe('b', 'base directory that -f is relative to.')

      .string('e')
      .alias('e', 'exclude')
      .describe('e', 'exclude files and/or directories')

      .string('o')
      .alias('o', 'out')
      .describe('o', 'file to write compiled.')

      .string('O')
      .alias('O', 'options')
      .describe('O', 'option variables (file path or JSON string).').argv;

    if (!argv.file && argv._.length < 1) {
      console.error('You must provide a file path!\n')
      yargs.showHelp();
      return;
    }

    var excludes = argv.e ? argv.e.split(' ') : null;
    var srcGlob = argv.file || argv._.shift();
    var outDir = argv.out;
    var baseDir = argv.b;

    var verbose = !!outDir; // output log only file output mode.
    function log (tag, msg) {
        if (!verbose) {
            return;
        }
        console.log((tag + ':\t' + msg).green);
    }

    function writeCompiled (result, srcPath, callback) {
        if (outDir) {
            srcPath = srcPath.replace(/\.ejs$/, '');
            if (!/\./.test(srcPath)) {
                srcPath += '.html';
            }
            srcPath = srcPath.replace(baseDir, '');

            var dest = path.join(outDir, srcPath);
            log('output', '"' + dest + '"');
            mkdirp(path.dirname(dest), function (err) {
                if (err) {
                    return callback(err);
                }

                fs.writeFile(dest, result, { encoding: 'utf8' }, function (err) {
                    callback(err);
                });
            });
        } else {
            log('output', 'STDOUT');
            console.log(result);
            callback();
        }
    }

    var srcPaths = [];
    var options = {};

    async.series([function (next) {
        // read options
        if (!argv.options) {
            log('opts', 'none');
            return next();
        }

        if (fs.existsSync(argv.options)) {
            log('opts', '"' + argv.options + '"');
            parseOptionsFile(argv.options, function (err, opts) {
                options = opts;
                next(err);
            });
            return;
        }

        log('options', argv.options);
        try {
            options = JSON.parse(argv.options);
        } catch (e) {
            return next(new Error('fail to parse options JSON.\n => ' + argv.options));
        }
        return next();

    }, function (next) {
        glob(path.join(baseDir, srcGlob), function (err, array) {
            if (err) {
                return next(err);
            }

            if (excludes) {
                srcPaths = array.filter(function (path) {
                    var isIncluded = true;
                    excludes.forEach(function (toExclude) {
                        if (path.includes(toExclude)) isIncluded = false;
                    });

                    return isIncluded;
                });
            }

            else {
                srcPaths = array;
            }
            next();
        });
    }, function (next) {
        if (!srcGlob) {
            fetchStdio(function (err, src) {
                var result = ejs.render(src, options);
                writeCompiled(result, null, next);
            });
            return;
        }

        async.each(srcPaths, function (srcPath, done) {
            ejs.renderFile(srcPath, options, function(err, result) {
                if (err) {
                    console.log(err);
                } else {
                    writeCompiled(result, srcPath, done);
                }
            });
        }, next);
    }], function (err) {
        if (err) {
            console.error(err);
        }
        process.exit();
    });
})();
