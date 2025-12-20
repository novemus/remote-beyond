import { expect } from 'chai';
import { describe, it } from 'mocha';
import { isNetworkEndpoint, isIPv4Endpoint, isNetworkEndpointList, isValidPierName } from '../utils';

describe('isNetworkEndpoint', () => {
  it('check for empty string or null/undefined endpoint', () => {
    expect(isNetworkEndpoint('')).to.be.false;
    expect(isNetworkEndpoint(null as any)).to.be.false;
    expect(isNetworkEndpoint(undefined as any)).to.be.false;
    expect(isNetworkEndpoint('   ')).to.be.false;
  });

  it('check for correct IPv6 endpoint', () => {
    expect(isNetworkEndpoint('[2001:db8::1]:8080')).to.be.true;
    expect(isNetworkEndpoint('[2001:db8::1]')).to.be.true;
    expect(isNetworkEndpoint('[fe80::881a:e83f:3ec5:186c]')).to.be.true;
    expect(isNetworkEndpoint('[::1]')).to.be.true;
  });

  it('check for incorrect IPv6 endpoint', () => {
    expect(isNetworkEndpoint('[2001:db8::1')).to.be.false;
    expect(isNetworkEndpoint('[invalid::ipv6]:8080')).to.be.false;
    expect(isNetworkEndpoint('[2001:db8::1]8080')).to.be.false;
    expect(isNetworkEndpoint('[2001:db8::::1]')).to.be.false;
  });

  it('check for correct IPv4 endpoint', () => {
    expect(isNetworkEndpoint('192.168.1.1:80')).to.be.true;
    expect(isNetworkEndpoint('10.0.0.1')).to.be.true;
    expect(isIPv4Endpoint('192.168.1.1:80')).to.be.true;
  });

  it('check for incorrect IPv4 endpoint', () => {
    expect(isNetworkEndpoint('192.168.1.1:99999')).to.be.false;
    expect(isIPv4Endpoint('192.168.1.1:99999')).to.be.false;
    expect(isIPv4Endpoint('10.0.0.256')).to.be.false;
  });

  it('check for correct hostname endpoint', () => {
    expect(isNetworkEndpoint('example.com:3000')).to.be.true;
    expect(isNetworkEndpoint('localhost')).to.be.true;
    expect(isNetworkEndpoint('test-site.org')).to.be.true;
    expect(isNetworkEndpoint('  example.com:80  ')).to.be.true;
  });

  it('check for incorrect hostname endpoint', () => {
    expect(isNetworkEndpoint('example.com:99999')).to.be.false;
    expect(isNetworkEndpoint('.example.com')).to.be.false;
    expect(isNetworkEndpoint('#example.com')).to.be.false;
  });

  it('check for valid endpoint list', () => {
    expect(isNetworkEndpointList('[2001:db8::1]:8080,[2001:db8::1],[fe80::881a:e83f:3ec5:186c],[::1],192.168.1.1:80,10.0.0.1')).to.be.true;
    expect(isNetworkEndpointList('example.com:3000,localhost,test-site.org,example.com:8080,example.com:80,[::1],192.168.1.1:80')).to.be.true;
  });

  it('check for invalid endpoint list', () => {
    expect(isNetworkEndpointList('[2001:db8::1]:8080,test-site.org,example.com:99999')).to.be.false;
    expect(isNetworkEndpointList('[2001:db8::1]:8080,')).to.be.false;
    expect(isNetworkEndpointList(',,')).to.be.false;
    expect(isNetworkEndpointList('')).to.be.false;
  });

  it('check for correct pier name', () => {
    expect(isValidPierName('owner/host')).to.be.true;
    expect(isValidPierName('jhon-doe@com.net/host')).to.be.true;
    expect(isValidPierName('owner123/host456')).to.be.true;
    expect(isValidPierName('123/456')).to.be.true;
  });

  it('check for incorrect pier name', () => {
    expect(isValidPierName('owner/')).to.be.false;
    expect(isValidPierName('jhon-doe@com.net')).to.be.false;
    expect(isValidPierName('/host123')).to.be.false;
    expect(isValidPierName('123')).to.be.false;
    expect(isValidPierName('owner//host')).to.be.false;
    expect(isValidPierName('owner</host')).to.be.false;
    expect(isValidPierName('owner|/host')).to.be.false;
    expect(isValidPierName('owner/host>')).to.be.false;
    expect(isValidPierName('owner/host\t')).to.be.false;
    expect(isValidPierName('owner/host\\')).to.be.false;
    expect(isValidPierName('owner:/host')).to.be.false;
    expect(isValidPierName('owner?/host')).to.be.false;
    expect(isValidPierName('owner*/host')).to.be.false;
  });
});
