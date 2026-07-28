"use strict";

const { discoverRalphAgents, assertRequiredAgents } = require("../lib/discovery");

module.exports = function (RED) {
  /**
   * Discovers all `.pi/agents/ralph-*.md` agent definitions under a repo root
   * and outputs them as msg.payload (array) / msg.ralph.agents. Used once at
   * the start of a loop run to validate required agents exist and to let
   * downstream ralph-run-agent nodes resolve model/tools/systemPrompt.
   *
   * Config:
   *   cwd            - repo root (typed input)
   *   requireDefault - if true, throws when planner/builder/reviewer/refactor/improver/fixer are missing
   */
  function RalphDiscoverAgentsNode(config) {
    RED.nodes.createNode(this, config);
    const node = this;
    node.cwd = config.cwd;
    node.cwdType = config.cwdType || "str";
    node.requireDefault = config.requireDefault !== false;

    node.on("input", (msg, send, done) => {
      send = send || function () { node.send.apply(node, arguments); };
      try {
        const cwd = node.cwdType === "msg"
          ? RED.util.getMessageProperty(msg, node.cwd || "ralph.cwd")
          : (node.cwd || msg?.ralph?.cwd || process.cwd());
        if (!cwd) throw new Error("ralph-discover-agents: no cwd resolved");

        const agents = discoverRalphAgents(cwd);
        if (node.requireDefault) assertRequiredAgents(agents);

        node.status({ fill: "green", shape: "dot", text: `${agents.length} agents` });
        send({ ...msg, payload: agents, ralph: { ...msg.ralph, cwd, agents } });
        done();
      } catch (err) {
        node.status({ fill: "red", shape: "ring", text: "error" });
        done(err);
      }
    });
  }

  RED.nodes.registerType("ralph-discover-agents", RalphDiscoverAgentsNode);
};
