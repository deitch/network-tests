#!/bin/bash

set -e

CALICO=/usr/local/bin/calicoctl


#etcdctl --endpoints=$ENDPOINTS put foo "Hello World!"
#  where ENDPOINTS=source_machine:2379


# do we already have calico
if [[ ! -e $CALICO ]]; then
	wget http://www.projectcalico.org/builds/calicoctl
	cp calicoctl $CALICO
	chmod +x $CALICO

	docker pull calico/node:latest
	docker pull calico/node-libnetwork:latest
fi	

