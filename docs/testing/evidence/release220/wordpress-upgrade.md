# WordPress upgrade acceptance

WordPress Plugin_Upgrader replaced active Free and Pro 2.1.4 with the exact 2.2.0 ZIPs from the candidate manifest in a disposable Windows WordPress installation with a dedicated loopback MariaDB. Both plugin headers reported 2.2.0 on the next request and both plugins remained active.

The same before/after SHA-256, c644d23fcc22a705f6e57343f629919ea6c0d0116f25a7669f1e66946aadba24, covered the page content, Bricks element metadata, conversation and message rows, application settings, fixture user preference, saved licence cache marker and active plugin list. This was a data-preservation test with external requests blocked. Active licence behaviour and manual translation publication were checked separately in the Mac acceptance report.
