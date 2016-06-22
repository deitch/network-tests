#!/bin/bash

set -e


# only remove the network once, on the source
if docker network ls | grep -wq calico; then
	calicoctl pool remove $PRIVATEIPCIDR || true
	docker network rm calico || true
fi
calicoctl node stop
calicoctl node remove


