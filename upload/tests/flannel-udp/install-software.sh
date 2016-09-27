#!/bin/bash

set -e

FLANNEL=/usr/local/bin/flanneld

# do we already have flannel?
if [[ ! -e $FLANNEL ]]; then
	VERSION=v0.6.2
	RELEASE=flannel-${VERSION}
	curl -L https://github.com/coreos/flannel/releases/download/${VERSION}/$RELEASE-linux-amd64.tar.gz -o $RELEASE.tar.gz
	tar xzvf $RELEASE.tar.gz
	cp flanneld $FLANNEL
	chmod +x $FLANNEL
fi