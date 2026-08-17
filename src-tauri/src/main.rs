// Prevents an additional console window from appearing on Windows in release
// builds — the app has no console UI, so a background console is just noise.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    ledger_lib::run();
}
