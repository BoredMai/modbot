var gulp = require('gulp');
var del = require('del');
var concat = require('gulp-concat');
var ts = require('gulp-typescript');
var nodemon = require('gulp-nodemon');

gulp.task('clean', function() {
    return del.sync('modbot.js');
})
gulp.task('build', function() {
    return gulp.src('src/**/*.js')
               .pipe(concat('modbot.js'))
               .pipe(gulp.dest('./'));
});

gulp.task('watch', ['clean', 'build'], function() {
    gulp.watch('src/**/*.js', ['build']);
    nodemon({ script: 'modbot.js' })
})