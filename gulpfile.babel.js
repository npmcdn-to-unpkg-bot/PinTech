import gulp from 'gulp';
import concat from 'gulp-concat';
import browser from 'browser-sync';
import gulpLoadPlugins from 'gulp-load-plugins';
import path from 'path';
import del from 'del';
import runSequence from 'run-sequence';
import babelCompiler from 'babel-core/register';
import * as isparta from 'isparta';

const plugins = gulpLoadPlugins();
const browserSync = browser.create();

const paths = {
	js: ['./**/*.js', '!dist/**', '!node_modules/**', '!coverage/**', '!client/**'],
	nonJs: ['./package.json', './.gitignore', './.env'],
	tests: './server/tests/*.js',
	clientJs: ['./client/*.js', './client/scripts/**/*.js']
};

gulp.task('browser-sync', () => {
	browserSync.init({
		server: {
			baseDir: 'client/'
		},
		socket: {
			domain: 'localhost:3000'
		}
	});
});

const options = {
	codeCoverage: {
		reporters: ['lcov', 'text-summary'],
		thresholds: {
			global: { statements: 80, branches: 80, functions: 80, lines: 80 },
			each: { statements: 50, branches: 50, functions: 50, lines: 50 }
		}
	}
};

gulp.task('client-scripts', () => {
	gulp.src(paths.clientJs)
			.pipe(concat('all.js'))
			.pipe(gulp.dest('./client/dist/'));
});

gulp.task('watch', ['browser-sync'], () => {
	gulp.watch('client/**/*.html', [browserSync.reload]);
	gulp.watch('client/**/*.js', ['client-scripts', browserSync.reload]);
});

// Clean up dist and coverage directory
gulp.task('clean', () =>
	del(['dist/**', 'coverage/**', '!dist', '!coverage'])
);

// Set env variables
gulp.task('set-env', () => {
	plugins.env({
		vars: {
			NODE_ENV: 'test'
		}
	});
});

// Lint Javascript
gulp.task('lint', () =>
	gulp.src(paths.js)
		// eslint() attaches the lint output to the "eslint" property
		// of the file object so it can be used by other modules.
		.pipe(plugins.eslint())
		// eslint.format() outputs the lint results to the console.
		// Alternatively use eslint.formatEach() (see Docs).
		.pipe(plugins.eslint.format())
		// To have the process exit with an error code (1) on
		// lint error, return the stream and pipe to failAfterError last.
		.pipe(plugins.eslint.failAfterError())
);

// Copy non-js files to dist
gulp.task('copy', () =>
	gulp.src(paths.nonJs)
		.pipe(plugins.newer('dist'))
		.pipe(gulp.dest('dist'))
);

// Compile ES6 to ES5 and copy to dist
gulp.task('babel', () =>
	gulp.src([...paths.js, '!gulpfile.babel.js'], { base: '.' })
		.pipe(plugins.newer('dist'))
		.pipe(plugins.sourcemaps.init())
		.pipe(plugins.babel())
		.pipe(plugins.sourcemaps.write('.', {
			includeContent: false,
			sourceRoot(file) {
				return path.relative(file.path, __dirname);
			}
		}))
		.pipe(gulp.dest('dist'))
);

// Start server with restart on file changes
gulp.task('nodemon', ['lint', 'copy', 'babel'], () =>
	plugins.nodemon({
		script: path.join('dist', 'index.js'),
		ext: 'js',
		ignore: ['node_modules/**/*.js', 'dist/**/*.js', 'client/**/*.js'],
		tasks: ['lint', 'copy', 'babel']
	})
);

// covers files for code coverage
gulp.task('pre-test', () =>
	gulp.src([...paths.js, '!gulpfile.babel.js'])
		// Covering files
		.pipe(plugins.istanbul({
			instrumenter: isparta.Instrumenter,
			includeUntested: true
		}))
		// Force `require` to return covered files
		.pipe(plugins.istanbul.hookRequire())
);

// triggers mocha test with code coverage
gulp.task('test', ['pre-test', 'set-env'], () => {
	let reporters;
	let	exitCode = 0;

	if (plugins.util.env['code-coverage-reporter']) {
		reporters = [...options.codeCoverage.reporters, plugins.util.env['code-coverage-reporter']];
	} else {
		reporters = options.codeCoverage.reporters;
	}

	return gulp.src([paths.tests], { read: false })
		.pipe(plugins.plumber())
		.pipe(plugins.mocha({
			reporter: plugins.util.env['mocha-reporter'] || 'spec',
			ui: 'bdd',
			timeout: 6000,
			compilers: {
				js: babelCompiler
			}
		}))
		.once('error', (err) => {
			plugins.util.log(err);
			exitCode = 1;
		})
		// Creating the reports after execution of test cases
		.pipe(plugins.istanbul.writeReports({
			dir: './coverage',
			reporters
		}))
		// Enforce test coverage
		.pipe(plugins.istanbul.enforceThresholds({
			thresholds: options.codeCoverage.thresholds
		}))
		.once('end', () => {
			plugins.util.log('completed !!');
			process.exit(exitCode);
		});
});

// clean dist, compile js files, copy non-js files and execute tests
gulp.task('mocha', ['clean'], () => {
	runSequence(
		['copy', 'babel']
	);
});

// gulp serve for development
gulp.task('serve', ['clean', 'client-scripts', 'watch'], () => runSequence('nodemon'));

// default task: clean dist, compile js files and copy non-js files.
gulp.task('default', ['clean', 'client-scripts'], () => {
	runSequence(
		['copy', 'babel']
	);
});
