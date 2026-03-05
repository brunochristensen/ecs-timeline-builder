import globals from 'globals';

export default [{
    files: ["js/*.js", "server.js", "server/*.js"],
    languageOptions: {
        ecmaVersion: 2022,
        globals: {
            ...globals.browser,
            ...globals.node,
            d3: "readonly"
        }
    },
    rules: {
        "no-unused-vars": "warn", "no-undef": "error", "semi": "warn", "no-console": "off"
    }
}];