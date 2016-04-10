#!/bin/sh

rm -rf dist
cp -R fe dist

mkdir -p dist/js
echo "var webirc = {};" > dist/js/webirc.js
for i in parse.js client.js; do
    echo $i
    cat src/$i >> dist/js/webirc.js
done

echo "all done"
