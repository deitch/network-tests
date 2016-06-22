#!/bin/bash

set -e

npname=netperf-$(hostname)

docker exec -i $npname $@
