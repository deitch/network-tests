#!/bin/bash

set -e

netserver -p $1 >/dev/null
pgrep netserver
