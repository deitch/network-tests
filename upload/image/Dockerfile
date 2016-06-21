FROM alpine
MAINTAINER avi@atomicinc.com

RUN \
	apk add --update curl gcc make libc-dev tcpdump coreutils && \
	curl -LO ftp://ftp.netperf.org/netperf/netperf-2.7.0.tar.gz && \
	tar -xzf netperf-2.7.0.tar.gz && \
	cd netperf-2.7.0 && \
	./configure && make && make install

