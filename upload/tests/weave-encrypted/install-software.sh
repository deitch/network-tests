#!/bin/bash

set -e

# do we already have weave?
WEAVE=/usr/local/bin/weave
if [[ ! -e $WEAVE ]]; then
	# because of the tx=off rx=off bug, we have to use the latest snapshot that fixed this
	# see https://github.com/weaveworks/weave/issues/2354
	curl -L git.io/weave-snapshot -o $WEAVE
	# curl -L git.io/weave -o $WEAVE
	chmod +x $WEAVE
fi

# we need ethtool as well
if ! command -v "ethtool" > /dev/null 2>&1; then
	yum install -y ethtool
fi
