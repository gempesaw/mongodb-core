'use strict';

// An enumeration of server types we know about
const ServerType = {
  Standalone: 'Standalone',
  Mongos: 'Mongos',
  PossiblePrimary: 'PossiblePrimary',
  RSPrimary: 'RSPrimary',
  RSSecondary: 'RSSecondary',
  RSArbiter: 'RSArbiter',
  RSOther: 'RSOther',
  RSGhost: 'RSGhost',
  Unknown: 'Unknown'
};

const WRITABLE_SERVER_TYPES = new Set([
  ServerType.RSPrimary,
  ServerType.Standalone,
  ServerType.Mongos
]);

const ISMASTER_FIELDS = [
  'minWireVersion',
  'maxWireVersion',
  'me',
  'hosts',
  'passives',
  'arbiters',
  'tags',
  'setName',
  'setVersion',
  'electionId',
  'primary',
  'logicalSessionTimeoutMinutes'
];

/**
 * The client's view of a single server, based on the most recent ismaster outcome.
 *
 * Internal type, not meant to be directly instantiated
 */
class ServerDescription {
  /**
   * Create a ServerDescription
   * @param {String} address The address of the server
   * @param {Object} [ismaster] An optional ismaster response for this server
   * @param {Object} [options] Optional settings
   * @param {Number} [options.roundTripTime] The round trip time to ping this server (in ms)
   */
  constructor(address, ismaster, options) {
    options = options || {};
    ismaster = Object.assign(
      {
        minWireVersion: 0,
        maxWireVersion: 0,
        hosts: [],
        passives: [],
        arbiters: [],
        tags: []
      },
      ismaster
    );

    this.address = address;
    this.error = null;
    this.roundTripTime = options.roundTripTime || 0;
    this.lastUpdateTime = Date.now();
    this.lastWriteDate = ismaster.lastWrite ? ismaster.lastWrite.lastWriteDate : null;
    this.opTime = ismaster.lastWrite ? ismaster.lastWrite.opTime : null;
    this.type = parseServerType(ismaster);

    // direct mappings
    ISMASTER_FIELDS.forEach(field => {
      if (typeof ismaster[field] !== 'undefined') this[field] = ismaster[field];
    });

    // normalize case for hosts
    this.hosts = this.hosts.map(host => host.toLowerCase());
    this.passives = this.passives.map(host => host.toLowerCase());
    this.arbiters = this.arbiters.map(host => host.toLowerCase());
  }

  get allHosts() {
    return this.hosts.concat(this.arbiters).concat(this.passives);
  }

  /**
   * @return {Boolean} Is this server available for reads
   */
  get isReadable() {
    return this.type === ServerType.RSSecondary || this.isWritable;
  }

  /**
   * @return {Boolean} Is this server available for writes
   */
  get isWritable() {
    return WRITABLE_SERVER_TYPES.has(this.type);
  }
}

/**
 * Parses an `ismaster` message and determines the server type
 *
 * @param {Object} ismaster The `ismaster` message to parse
 * @return {ServerType}
 */
function parseServerType(ismaster) {
  if (!ismaster || !ismaster.ok) {
    return ServerType.Unknown;
  }

  if (ismaster.isreplicaset) {
    return ServerType.RSGhost;
  }

  if (ismaster.msg && ismaster.msg === 'isdbgrid') {
    return ServerType.Mongos;
  }

  if (ismaster.setName) {
    if (ismaster.hidden) {
      return ServerType.RSOther;
    } else if (ismaster.ismaster) {
      return ServerType.RSPrimary;
    } else if (ismaster.secondary) {
      return ServerType.RSSecondary;
    } else if (ismaster.arbiterOnly) {
      return ServerType.RSArbiter;
    } else {
      return ServerType.RSOther;
    }
  }

  return ServerType.Standalone;
}

module.exports = {
  ServerDescription,
  ServerType
};
