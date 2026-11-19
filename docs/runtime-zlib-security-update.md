# Debian 13 runtime zlib security update

The five SET Service runtime targets retain the approved immutable distroless Node 24 base and Node 24.22.0. They add the **official Debian 13 security backport** of the existing zlib package. This is a SET Service derived image, not a claim that the upstream distroless digest has changed.

On 2026-11-07, [DSA-6613-1](https://security-tracker.debian.org/tracker/DSA-6613-1) published `zlib1g 1:1.3.dfsg+really1.3.1-1+deb13u1` for trixie-security. Debian marks it fixed for [CVE-2026-76844](https://security-tracker.debian.org/tracker/CVE-2026-76844) and [CVE-2026-85091](https://security-tracker.debian.org/tracker/CVE-2026-85091). The currently published official distroless Node 24 image still contained the older package when checked; changing only that base digest did not fix the findings.

| Reviewed artifact | SHA-256 |
|---|---|
| Official amd64 `.deb`, 88,720 bytes | `8c27c342230503b73dfde629642c3b352e87b554e06d60cf58772f236a305ceb` |
| Fixed `/usr/lib/x86_64-linux-gnu/libz.so.1.3.1` | `6c13931760210e8b391b63a337dfe4071346c4ad6e3827694edb7b6989bb16dd` |

The package is downloaded from `security.debian.org` using Docker's mandatory content checksum. Its checksum was verified against the official Packages index, whose checksum was verified against a `gpgv`-authenticated Debian InRelease. The signed metadata snapshot was dated 2026-11-07 and valid until 2026-11-14; this records the verification date, not permission to disable future signature/expiry checks. Reproducible builds use the reviewed immutable package bytes, not a floating apt upgrade.

The builder checks the exact package name, version and architecture, the four-file payload allowlist, the sole `libz.so.1` symlink, package MD5 manifest and independent library SHA-256. Extraction does not execute maintainer scripts or triggers. Only the library, package documentation and accurate distroless `status.d` records enter the final image. No package manager, shell, compiler or extra runtime dependency is added.

The source remains upstream 1.3.1 with Debian security backports. Static ABI comparison against the previous runtime library verified the same `libz.so.1` SONAME, all 102 versioned exports, and the same GLIBC requirements. Dependency remains `libc6 >= 2.14`. The source fix restores input state after a failed direct write; the absence of `gz_vacate()` in old source was not adequate evidence to exclude the vulnerability.

All five targets inherit this update through `app-runtime-base`. The runtime regression checks actual library bytes and package metadata in every image, in addition to Node version, uid/gid, entrypoints, Prisma and native-image functionality. Existing vulnerability and secret scans remain blocking, including unfixed HIGH findings. No CVE ignore, VEX exception, severity change or historical-secret reclassification is introduced.

This patch targets the existing Linux amd64 release platform. Any other architecture requires a separately reviewed package and ABI check. The four existing immutable CI image variables stay unchanged. Publication must build the approved source commit and record each final image digest, SBOM and provenance; the old distroless digest alone is not the final application-image identity.

When official distroless incorporates the Debian fix, remove this temporary overlay only in a separately verified change: pin the replacement base, confirm its actual package/library provenance, update exact runtime assertions if needed, rebuild all five targets, and pass the unchanged scans and regression suites. Do not replace the pinned package with a floating download or copy an unstable-distribution library into the runtime.
