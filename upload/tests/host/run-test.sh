#!/bin/bash

set -e

docker run --rm --net=host netperf $@

