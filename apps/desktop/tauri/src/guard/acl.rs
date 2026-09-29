//! Each feature plugin's ACL list is its handler (effort 840, requirement and criterion 9).
//!
//! `build.rs` derives every `src/<module>/plugin.rs`'s command list from its `generate_handler!`
//! and registers it as an inline plugin whose default permission allows exactly those commands.
//! Tauri checks a plugin's commands against that list by exact name and checks the list against
//! nothing, so a command handled but not listed would be refused at runtime and nowhere earlier.
//! What is held here is that the list the build wrote is what the handler answers, that the
//! capability grants each plugin its default, that `lib.rs` registers them in the order the plan
//! sets, and that it composes them and does nothing a feature does.

#[cfg(test)]
mod tests {
    use std::path::Path;

    /// One plugin as `build.rs` read it: `commands` is what the ACL allows, `handled` is the
    /// string each handler entry answers to, from the macro `#[tauri::command]` writes beside it.
    pub struct FeaturePlugin {
        pub module: &'static str,
        pub name: &'static str,
        pub commands: &'static [&'static str],
        pub handled: &'static [&'static str],
    }

    include!(concat!(env!("OUT_DIR"), "/feature-plugins.rs"));

    fn read(file: &str) -> String {
        let path = Path::new(env!("CARGO_MANIFEST_DIR")).join(file);

        std::fs::read_to_string(&path)
            .unwrap_or_else(|error| panic!("cannot read {}: {error}", path.display()))
    }

    /// **Criterion 9.** Each derived list is exactly the names its handler answers, in its order.
    #[test]
    fn each_plugin_allows_exactly_what_its_handler_answers() {
        let modules: Vec<&str> = FEATURE_PLUGINS.iter().map(|plugin| plugin.module).collect();

        for expected in [
            "database",
            "diagnostics",
            "organization",
            "print",
            "settings",
            "startup",
            "sync",
            "transfer",
            "update",
            "upgrade",
            "window",
        ] {
            assert!(
                modules.contains(&expected),
                "build.rs found no plugin in {expected}/; it found {modules:?}"
            );
        }

        for plugin in FEATURE_PLUGINS {
            assert_eq!(
                plugin.commands, plugin.handled,
                "plugin {}: the ACL allows the first list and the handler answers the second; a \
                 command answers to its function name without `{}_`, through \
                 `#[tauri::command(rename)]`",
                plugin.name, plugin.module
            );
        }
    }

    /// A plugin nobody is granted refuses every command, so the capability names each default.
    #[test]
    fn the_capability_grants_each_plugin_its_default() {
        let capability: serde_json::Value =
            serde_json::from_str(&read("capabilities/default.json"))
                .expect("capabilities/default.json is not JSON");
        let permissions = capability["permissions"]
            .as_array()
            .expect("the capability lists no permissions");

        for plugin in FEATURE_PLUGINS {
            let default = format!("{}:default", plugin.name);

            assert!(
                permissions.iter().any(|permission| permission == &default),
                "capabilities/default.json does not grant {default}"
            );
        }
    }

    /// **Criterion 9.** `lib.rs` registers every feature plugin, `diagnostics` first of them, and
    /// manages the state they share before it registers any plugin at all.
    #[test]
    fn diagnostics_registers_first_after_the_shared_state() {
        let lib = read("src/lib.rs");
        let first_plugin = lib.find(".plugin(").expect("lib.rs registers no plugin");
        let last_manage = lib
            .rfind(".manage::<")
            .expect("lib.rs manages no shared state");

        assert!(
            last_manage < first_plugin,
            "lib.rs manages state after it registers a plugin, which a plugin's setup cannot read"
        );

        let registered: Vec<(usize, &str)> = FEATURE_PLUGINS
            .iter()
            .map(|plugin| {
                let line = format!(".plugin({}::plugin())", plugin.module);
                let at = lib
                    .find(&line)
                    .unwrap_or_else(|| panic!("lib.rs does not register {line}"));

                (at, plugin.module)
            })
            .collect();
        let first = registered
            .iter()
            .min()
            .map(|(_, module)| *module)
            .expect("no feature plugin is registered");

        assert_eq!(
            first, "diagnostics",
            "the first feature plugin lib.rs registers"
        );
    }

    /// **Criterion 9.** `lib.rs` composes and does nothing a feature does: it handles no command,
    /// so every command is a plugin's; it manages nothing but the two ports every plugin's setup
    /// may read, so every feature's state is its own plugin's; and `state.rs`, where the features'
    /// state was once held together, is gone.
    #[test]
    fn lib_composes_plugins_and_names_no_command_or_state() {
        let lib = read("src/lib.rs");

        for handled in ["generate_handler!", "invoke_handler", "#[tauri::command]"] {
            assert!(
                !lib.contains(handled),
                "lib.rs contains `{handled}`, and every command is a feature plugin's"
            );
        }

        let managed: Vec<&str> = lib
            .match_indices(".manage")
            .map(|(at, _)| lib[at..].split('(').next().unwrap_or_default())
            .collect();

        assert_eq!(
            managed,
            vec![
                ".manage::<credential::Credentials>",
                ".manage::<clock::Shared>"
            ],
            "lib.rs manages state of its own, where each feature's is its plugin's"
        );
        assert!(
            !Path::new(env!("CARGO_MANIFEST_DIR"))
                .join("src/state.rs")
                .exists(),
            "src/state.rs is back"
        );
    }
}
