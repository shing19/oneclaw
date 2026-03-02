#!/usr/bin/env node

import { Command } from "commander";

const program = new Command();

program.name("oneclaw").version("0.1.0");

await program.parseAsync();
