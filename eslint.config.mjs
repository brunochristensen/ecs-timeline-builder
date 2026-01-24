import globals from 'globals';

export default [{
    files: ["js/*.js", "server.js"],
    languageOptions: {
        ecmaVersion: 2021,
        globals: {
            ...globals.browser,
            ...globals.node,
            d3: "readonly",
            ECSParser: "readonly",
            TimelineVis: "readonly",
            TimelineSync: "readonly",
            Utils: "readonly",
            DetailRenderer: "readonly"
        }
    },
    rules: {
        "no-unused-vars": "warn", "no-undef": "error", "semi": "warn", "no-console": "off"
    }
}];