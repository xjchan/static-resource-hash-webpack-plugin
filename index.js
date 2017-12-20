/*
* V0.0.1
* By ChenXiaojie
* */

var fs = require('fs');
var path = require('path');
var glob = require('glob');
var crypto = require('crypto');
var os = require('os');

var hashFileObjects = [];
var filePatterns = [
  /(url\s*\( *)([^:\*\?<>'"\|\(\)@;]*\.[^:\*<>'"\|\(\)@;]+)( *['"]*\))/g,
  /(')([^:\*\?<>'"\|\(\)@;]*\.[^:\*<>'"\|\(\)@;]+)(')/g,
  /(")([^:\*\?<>'"\|\(\)@;]*\.[^:\*<>'"\|\(\)@;]+)(")/g,
]


// {
//   log: false,
//   hashLength: 8,
//   destRoot: 'app',
//   publicPath: "your.host",
//   outputFile: 'rename.json',
//   hashFiles: ['/**//*.js', '/**//*.css'],
//   hostFiles: ['/**//*.js', '/**//*.html', '/**//*.css'],
//   delay: 0 
// }

function StaticResHashPlugin(options) {
  if (!options) options = {};
  if (!options.hashFiles) {
    console.error('hashFiles is needed!');
  }
  if (!options.hostFiles) {
    console.error('hostFiles is needed!');
  }
  if (options.destRoot === undefined) {
    console.error('destRoot is needed!');
  }
  if (options.tplRoot === undefined) {
    // console.error('tplRoot is needed!');
  }
  if (options.publicPath === undefined) {
    console.error('publicPath is needed!');
  }
  if (options.outputFile === undefined) {
    console.error('outputFile is needed!');
  }

  options.delay = options.delay ? +options.delay : 0;
  this.options = options;
  this.options.hashLength = options.hashLength || 8;
}

var globOpts;

StaticResHashPlugin.prototype.apply = function (compiler) {
  this.compiler = compiler;
  compiler.plugin('done', function () {
    var that = this;
    setTimeout(function () {
      globOpts = {
        root: path.resolve(that.options.destRoot),
        nodir: true,
        log: !!that.options.log
      };

      if (that.options.tplRoot != undefined) {
        tplGlobOpts = {
          root: path.resolve(that.options.tplRoot),
          nodir: true,
          log: !!that.options.log
        };
      }


      globOpts.log && console.log('current context path : ' + process.cwd());

      var hashFiles = that.options.hashFiles;
      var hostFiles = that.options.hostFiles;
      var hashLength = that.options.hashLength;
      var tmpFiles, hashFilExist;
      for (var i = 0; i < hashFiles.length; i++) {
        tmpFiles = glob.sync(hashFiles[i], globOpts);
        for (var j = 0; j < tmpFiles.length; j++) {
          var obj = {
            path: path.resolve(tmpFiles[j]),
            hash: calcHashByFile(tmpFiles[j], hashLength)
          };
          obj.ext = path.extname(tmpFiles[j]);
          obj.name = path.basename(tmpFiles[j], obj.ext);
          var oldHash = obj.name.substr(obj.name.lastIndexOf('.') + 1)
          // console.log("oldHash: "+ oldHash)
          if (oldHash == obj.hash) {
            obj.hashBaseName = obj.name + obj.ext;
          } else {
            obj.hashBaseName = obj.name + '.' + obj.hash + obj.ext;
          }

          obj.hashPath = path.join(path.dirname(obj.path), obj.hashBaseName);

          hashFilExist = false;
          for (var m = 0; m < hashFileObjects.length; m++) {
            if (hashFileObjects[m].path === obj.path) {
              hashFilExist = true;
              break;
            }
          }
          !hashFilExist && hashFileObjects.push(obj);
        }
      }

      var logData = {}
      // if (fs.existsSync(that.options.outputFile)) {
      //   var outputFile = fs.readFileSync(that.options.outputFile, 'utf8');
      //   logData = JSON.parse(outputFile)
      // }

      for (i = 0; i < hostFiles.length; i++) {
        tmpFiles = glob.sync(hostFiles[i], globOpts);
        tplFiles = [];
        //tplRoot参数不传时不错模板扫描
        if (that.options.tplRoot != undefined && that.options.tplRoot != "") {
          tplFiles = glob.sync(hostFiles[i], tplGlobOpts);
        }

        for (j = 0; j < tmpFiles.length; j++) {
          updateHashRef(tmpFiles[j], that.options.publicPath, logData, true);
        }

        for (j = 0; j < tplFiles.length; j++) {
          updateHashRef(tplFiles[j], that.options.publicPath, logData, false);
        }
      }

      //log down the change of urls
      fs.writeFileSync(that.options.outputFile, JSON.stringify(logData), function (err) {
        console.log()
      })

      //rename hashFiles
      for (i = 0; i < hashFileObjects.length; i++) {
        globOpts.log && console.log('file [' + hashFileObjects[i].path + '] execute rename --> [' + hashFileObjects[i].hashPath + ']');
        fs.renameSync(hashFileObjects[i].path, hashFileObjects[i].hashPath);
      }
    }, that.options.delay);
  }.bind(this));
}


function calcHashByFile(fp, length) {
  var cont = fs.readFileSync(fp);
  if (os.platform() == 'win32' && fp.match("\.js|\.css") != null) {
    cont = Dos2Unix(cont)
  }

  var shaHasher = crypto.createHash('sha1');
  shaHasher.update(cont);
  return shaHasher.digest('hex').slice(0, length);
}

function Dos2Unix(buf) {
  let arr = []
  for (let i = 0; i < buf.length; i++) {
    let m = buf[i]
    if (i == buf.length - 1) {
      arr.push(m)
      break
    }
    let af = buf[i + 1]
    if (m == 0x0d && af == 0x0a) {
      continue
    }
    arr.push(m)
  }
  return new Buffer(arr)
}

function updateHashRef(hostFilePath, publicPath, logObj, replace) {
  if (publicPath[publicPath.length - 1] == "/") {
    publicPath = publicPath.substr(0, publicPath.length - 1)
  }

  var cont = fs.readFileSync(hostFilePath, 'utf8');

  for (var i = 0; i < filePatterns.length; i++) {
    cont = cont.replace(filePatterns[i], function (cont, sm01, link, sm03) {
      var pre = ""
      var reg = "(" + publicPath + ")(.*)"
      var m = link.match(reg)

      if (m != null) {
        pre = m[1]
        link = m[2]
      }

      var ext = path.extname(hostFilePath).toUpperCase();
      var dir = path.dirname(hostFilePath);
      var linkAbsPath;
      var originalLink = link;
      var queryStartIndex = link.indexOf('?');
      var queryString = '';
      if (queryStartIndex > -1) {
        link = link.substr(0, queryStartIndex);
        queryString = originalLink.substring(queryStartIndex, originalLink.length);
      }
      //path in css. path begin with dot or virgule is relative.
      if ('.CSS' === ext && (link.startsWith('.') || (!link.startsWith('/') && !link.startsWith('\\')))) {
        linkAbsPath = path.join(dir, link);
      } else {
        linkAbsPath = path.join(globOpts.root, link);
      }

      if (linkAbsPath && fs.existsSync(linkAbsPath)) {
        //find hashvalue from hashFiles
        for (var j = 0; j < hashFileObjects.length; j++) {
          if (hashFileObjects[j].path === linkAbsPath) {
            globOpts.log && console.log('file [' + hostFilePath + '] execute replace [' + link + '] --> [' + hashFileObjects[j].hashBaseName + ']')
            logObj[pre + link] = pre + path.join(path.dirname(link), hashFileObjects[j].hashBaseName).replace(/\\/g, '/')
            if (replace) {
              return sm01 + pre + path.join(path.dirname(link), hashFileObjects[j].hashBaseName).replace(/\\/g, '/') + queryString + sm03;
            }
            return cont;
          }
        }
      }
      return cont;
    });
  }
  fs.writeFileSync(hostFilePath, cont);
}

module.exports = StaticResHashPlugin

