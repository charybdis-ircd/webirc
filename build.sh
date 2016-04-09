#!/bin/sh

rm -rf dist
cp -R fe dist

mkdir -p dist/js
touch dist/js/webirc.js
for i in parse.js; do
    echo $i
    cat src/*.js >> dist/js/webirc.js
done

echo "all done"
