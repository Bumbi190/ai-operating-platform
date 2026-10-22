FROM docker.io/library/node@sha256:efd0ab5780c2d9ab1f0f869571a00d5edb17793bff4cce4a2792e3eb0ffc7562 AS dependencies
WORKDIR /opt/omnira/deps
ENV NODE_ENV=production
RUN mkdir -p /opt/omnira && touch /opt/omnira/npm-user.config /opt/omnira/npm-global.config
COPY package.json package-lock.json ./
COPY apps/web/package.json ./apps/web/package.json
COPY packages/local-text-contract/package.json ./packages/local-text-contract/package.json
RUN npm ci --ignore-scripts --include=dev --include=optional --no-audit --no-fund --userconfig=/opt/omnira/npm-user.config --globalconfig=/opt/omnira/npm-global.config --registry=https://registry.npmjs.org
# The owned zero-dependency sentinel uses a literal fixture lock, never rewrites the project lock.
RUN mkdir -p /opt/omnira/sentinel && printf '%s' '{"name":"omnira-install-sentinel","version":"1.0.0","scripts":{"postinstall":"touch /tmp/omnira-lifecycle-sentinel"}}' > /opt/omnira/sentinel/package.json && printf '%s' '{"name":"omnira-install-sentinel","version":"1.0.0","lockfileVersion":3,"requires":true,"packages":{"":{"name":"omnira-install-sentinel","version":"1.0.0","hasInstallScript":true}}}' > /opt/omnira/sentinel/package-lock.json && cd /opt/omnira/sentinel && npm ci --ignore-scripts --offline --no-audit --no-fund --userconfig=/opt/omnira/npm-user.config --globalconfig=/opt/omnira/npm-global.config && test ! -e /tmp/omnira-lifecycle-sentinel
COPY dependency-inventory.mjs /opt/omnira/dependency-inventory.mjs
RUN node /opt/omnira/dependency-inventory.mjs prepare

FROM docker.io/library/node@sha256:efd0ab5780c2d9ab1f0f869571a00d5edb17793bff4cce4a2792e3eb0ffc7562
COPY --from=dependencies /opt/omnira/deps /opt/omnira/deps
COPY --from=dependencies /opt/omnira/dependency-inventory.json /opt/omnira/dependency-inventory.json
COPY fixture-runner.mjs vitest-fixture.config.mjs dependency-inventory.mjs /opt/omnira/
RUN mkdir -p /workspace/repo && chown 10001:10001 /workspace/repo && chmod 0755 /workspace/repo && ln -s /opt/omnira/deps/node_modules /workspace/repo/node_modules && chown -h 10001:10001 /workspace/repo/node_modules && chmod 0444 /opt/omnira/*.mjs /opt/omnira/dependency-inventory.json
USER 10001:10001
WORKDIR /workspace/repo
ENV HOME=/tmp LANG=C.UTF-8 NODE_ENV=test
ENTRYPOINT ["/usr/local/bin/node","/opt/omnira/fixture-runner.mjs"]
CMD []
