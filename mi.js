"use strict";

const gulp = require("gulp");
const fs = require("fs");
const search = require("gulp-search");
const replace = require("gulp-batch-replace");
const del = require("del");
const imageResize = require("gulp-image-resize");
const webshot = require("gulp-webshot");
const zip = require("gulp-zip");
const Vinyl = require("vinyl");
const through2 = require("through2").obj;
const gulpSlash = require("gulp-slash");
const argv = require("yargs").argv;

let mainFolder;

if (argv.path) {
  mainFolder = argv.path;
  console.log(mainFolder);
} else {
  console.log("Параметры отсутсвуют");
  //mainFolder = "./";
  throw new Error("Параметры отсутсвуют");
}

let sliderFolder = "./library/mi_slider/";

let workFolder = mainFolder + "/project/";
let destFolder = mainFolder + "/build/";
let zipFolder = mainFolder + "/zip/";

gulp.task("move", function () {
  return gulp
    .src([workFolder + "*.html"], { read: false })
    .pipe(gulpSlash())
    .pipe(
      through2(async function (file, e, c) {
        let filename = file.stem;

        /** scan html file */
        await new Promise((resolve, reject) => {
          let regexMatch = /((src|href)="[^"]+")|((src|href)='[^']+')|(url\([^\)]+)/g;
          let regexFilter = /\.(css|js)/;

          let html = fs.readFileSync(file.path, "utf8");

          let res = html.match(regexMatch);
          res = res.filter((str) => regexFilter.test(str));
          res = res.map(
            (item) =>
              workFolder + item.replace(/src\=|href\=|url|\"|\'|\(|\)/g, "")
          );

          console.log("scan html file: ", filename, res);

          gulp
            .src(res, { allowEmpty: true })
            .pipe(gulpSlash())
            .pipe(
              gulp.dest(function (f) {
                if (f.extname == ".js") {
                  return destFolder + filename + "/js";
                } else if (f.extname == ".css") {
                  return destFolder + filename + "/css";
                }
              })
            )
            .on("end", resolve(null));
        });

        /** move image */
        await new Promise((resolve, reject) => {
          //console.log('move image: ', filename);
          gulp
            .src([
              workFolder + "image/" + filename + "/*.*",
              workFolder + "image/*.*",
            ])
            .pipe(gulp.dest(destFolder + filename + "/image/"))
            .on("end", resolve(null));
        });
        /** move fonts */
        await new Promise((resolve, reject) => {
          //console.log('move image: ', filename);
          gulp
            .src([
              workFolder + "fonts/" + filename + "/*.*",
              workFolder + "fonts/*.*",
            ])
            .pipe(gulp.dest(destFolder + filename + "/fonts/"))
            .on("end", resolve(null));
        });

        /** move pdf */
        await new Promise((resolve, reject) => {
          //console.log('move pdf: ', filename);
          gulp
            .src([
              workFolder + "pdf/" + filename + "/*.*",
              workFolder + "pdf/*.*",
            ])
            .pipe(gulp.dest(destFolder + filename + "/pdf/"))
            .on("end", resolve(null));
        });

        /** move parametrs.xml */
        await new Promise((resolve, reject) => {
          //console.log('move parametrs.xml: ', filename);
          gulp
            .src([workFolder + "parameters/" + filename + ".xml"], {
              allowEmpty: true,
            })
            .pipe(gulp.dest(destFolder + filename + "/parameters/"))
            .on("data", (f) => {
              fs.renameSync(f.path, f.dirname + "/parameters.xml");
            })
            .on("end", resolve(null));
        });

        /** move html file */
        await new Promise((resolve, reject) => {
          //console.log('move html file: ', filename);
          gulp
            .src(file.path)
            .pipe(gulpSlash())
            .pipe(replace([[new RegExp("/" + filename + "/", "g"), "/"]]))
            .pipe(gulp.dest(destFolder + filename + "/"))
            .on("data", (f) => {
              fs.renameSync(f.path, f.dirname + "/index.html");
            })
            .on("end", resolve(null));
        });

        /** close */
        console.log("filename", filename);
        c();
      })
    );
});

gulp.task("clear_dest", function () {
  // почистить целевую директорию
  return del(
    [destFolder + "*", "!" + destFolder + "preview", zipFolder + "*"],
    { force: true }
  );
});

gulp.task("webshot", function () {
  //https://github.com/brenden/node-webshot#options
  let options = {
    dest: destFolder + "preview/",
    root: workFolder,
    screenSize: { width: 1024, height: 768 },
    shotSize: { width: 1024, height: 768 },
    flatten: true,
    streamType: "jpg",
    renderDelay: 9999,
  };

  return gulp
    .src(workFolder + "*.html")
    .pipe(gulpSlash())
    .pipe(webshot(options));
});
gulp.task("thumbnails", function (cbk) {
  gulp
    .src(dest_folder + "preview/*.jpg")
    .pipe(gulpSlash())
    .pipe(
      imageResize({
        width: 200,
        height: 150,
        crop: false,
        upscale: true,
      })
    )
    .pipe(
      gulp.dest(function (f) {
        return dest_folder + f.stem + "/media/images/thumbnails";
      })
    )
    .pipe(
      through2(function (f, e, c) {
        try {
          fs.rename(f.path, f.dirname + "/200x150.jpg", () => {
            c(null, f);
          });
        } catch (e) {
          c(null, f);
        }
      })
    )
    .on("data", function (file) {})
    .on("end", () => {
      cbk();
    });
});

gulp.task("mi_slider", function (cbk) {
  return gulp
    .src([workFolder + "*.json", "!" + workFolder + "temp.json"], {
      read: false,
    })
    .pipe(gulpSlash())
    .pipe(
      through2(function (f, e, c) {
        let obj = JSON.parse(fs.readFileSync(f.path, "utf8"));
        let sName = f.stem;
        let parDir = destFolder + sName + "/parameters/";

        Promise.all(
          obj.map((item) => {
            return everySlide(sName, item);
          })
        )
          .then(() => {
            return new Promise((resolve, reject) => {
              let call = 0;
              let callback = () => {
                call++;
                if (call === 4) {
                  resolve();
                }
              };
              /** Генерируем XML */
              let parXML =
                '<?xml version="1.0"?>\n' +
                '<Sequence xmlns="urn:param-schema">\n' +
                "\t<Pages>\n" +
                objToString(f.stem, obj) +
                "\t</Pages>\n" +
                "</Sequence>";
              stringSrc("parameters.xml", parXML)
                .pipe(gulp.dest(parDir))
                .on("end", () => {
                  callback();
                });

              /** Генерируем JSON */
              let parJSON = [];
              obj.forEach((item) => {
                parJSON.push({ pageid: sName + "|" + item });
              });
              stringSrc("parameters.json", JSON.stringify(parJSON))
                .pipe(gulp.dest(parDir))
                .on("end", () => {
                  callback();
                });

              /** Переносим Thumbnails */
              gulp
                .src(
                  destFolder + obj[0] + "/media/images/thumbnails/200x150.jpg"
                )
                .pipe(gulpSlash())
                .pipe(
                  gulp.dest(destFolder + sName + "/media/images/thumbnails")
                )
                .on("end", () => {
                  callback();
                });

              /** Переносим Slider */
              gulp
                .src(sliderFolder + "**/*.*")
                .pipe(gulpSlash())
                .pipe(gulp.dest(destFolder + sName + "/"))
                .on("end", () => {
                  callback();
                });
            });
          })
          .then(() => {
            c(null, f);
          })
          .catch((e) => {});
      })
    )
    .on("end", () => {
      cbk();
    });
  function objToString(slide, obj) {
    let string = "";
    obj.forEach((item) => {
      string = `${string}\t\t<Page pageid="${slide}|${item}" />\n`;
    });
    return string;
  }
  function everySlide(slide, item) {
    return new Promise((resolve, reject) => {
      gulp
        .src([destFolder + item + "/**/*.*"])
        .pipe(gulpSlash())
        .pipe(gulp.dest(destFolder + slide + "/slides/" + item))
        .on("end", () => {
          resolve();
        });
    });
  }
});
gulp.task("zip", function () {
  return gulp
    .src(destFolder + "*", { read: false })
    .pipe(gulpSlash())
    .pipe(
      through2(function (f, e, c) {
        if (f.stem != "preview") {
          gulp
            .src(f.path + "/**/*")
            .pipe(gulpSlash())
            .pipe(zip(f.stem + ".zip"))
            .pipe(gulp.dest(zipFolder))
            .on("end", () => {
              c(null, f);
            });
        } else {
          c(null, f);
        }
      })
    );
});
gulp.task("pdf", function () {
  return gulp
    .src(destFolder + "*/", { read: false })
    .pipe(gulpSlash())
    .pipe(
      through2(function (f, e, c) {
        if (f.stem != "preview") {
          gulp
            .src(workFolder + "*.pdf")
            .pipe(gulpSlash())
            .pipe(gulp.dest(f.path))
            .on("end", () => {
              c(null, f);
            });
        } else {
          c(null, f);
        }
      })
    );
});

gulp.task("==============", function (cbk) {
  cbk();
});
gulp.task(
  "build_with_preview",
  gulp.series(
    "clear_dest",
    "move",
    "pdf",
    "webshot",
    "thumbnails",
    "mi_slider",
    "zip"
  )
);
gulp.task(
  "build",
  gulp.series("clear_dest", "move", "pdf", "thumbnails", "mi_slider", "zip")
);

function stringSrc(filename, string) {
  let src = require("stream").Readable({ objectMode: true });
  src._read = function () {
    this.push(
      new Vinyl({
        path: filename,
        contents: new Buffer(string),
      })
    );
    this.push(null);
  };
  return src;
}
