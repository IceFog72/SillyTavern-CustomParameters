# Advanced Parameters Extension

<img width="2560" height="1402" alt="image" src="https://github.com/user-attachments/assets/ab9c851e-9efb-4c14-bee8-0ea6498a99be" />


A comprehensive SillyTavern extension that goes beyond sliders to allow configuration of all types of parameters for custom OpenAI-compatible APIs. This extension supports multiple input types and can configure complex parameter structures.

## Features

### Supported Parameter Types

1. **Slider (Range)** - For numerical values within a range
   - Min, max, and step values
   - Both range slider and number input
   - Perfect for: temperature, top_p, top_k, etc.

2. **Number Input** - For direct numerical entry
   - Good for: repetition_penalty, min_p, etc.

3. **Text Input** - For single-line text values
   - Good for: model names, string parameters

4. **Text Area** - For multi-line text input
   - Good for: prompt prefixes, grammar rules, etc.

5. **Checkbox** - For boolean values (true/false)
   - Good for: enable_thinking, preserve_thinking, etc.

6. **Select Dropdown** - For single selection from predefined options
   - Good for: sampler selection, format choice

7. **Multi-Select** - For multiple selections
   - Good for: sampler lists, feature flags

8. **Array/List** - For comma-separated or delimited values
   - Configurable delimiter (comma, semicolon, etc.)
   - Good for: custom_token_bans, stop sequences

9. **Object (JSON)** - For complex nested structures
   - Full JSON editing capability
   - Validation with visual feedback
   - Good for: logit_bias, chat_template_kwargs, grammar rules

## Configuration Examples

### Example 1: Basic Sampler Configuration

Create a multi-select parameter:
- **Name:** Samplers
- **Property:** samplers
- **Type:** Multi-Select
- **Options:** penalties, top_n_sigma, top_k, typ_p, dry, top_p, min_p, adaptive_p, xtc, temperature

### Example 2: Temperature Slider

Create a slider parameter:
- **Name:** Temperature
- **Property:** temperature
- **Type:** Slider
- **Min:** 0.0
- **Max:** 2.0
- **Step:** 0.01

### Example 3: Custom Token Bans

Create an array parameter:
- **Name:** Custom Token Bans
- **Property:** custom_token_bans
- **Type:** Array
- **Delimiter:** ,
- **Example value:** `248069,248068`

### Example 4: Logit Bias (Complex)

Create an object parameter:
- **Name:** Logit Bias
- **Property:** logit_bias
- **Type:** Object
- **Value:** 
```json
[
  [248069, false],
  [248068, false]
]
```

### Example 5: Chat Template Settings

Create an object parameter:
- **Name:** Chat Template Settings
- **Property:** chat_template_kwargs
- **Type:** Object
- **Value:**
```json
{
  "enable_thinking": false,
  "preserve_thinking": false
}
```

### Example 6: Grammar Rules

Create a textarea parameter:
- **Name:** Grammar
- **Property:** grammar
- **Type:** Textarea
- **Value:** GBNF grammar rules (see below)

## Advanced Parameter Configuration

### Grammar Example

The extension can handle complex grammar definitions:

```
# --- GBNF RULES ---
root ::= "<plan>\n" role-rule safety-rule perspective-rule vector-rule relational-rule dominant-rule dynamic-rule somatic-rule subtext-rule micro-rule action-rule dialogue-rule stagnation-rule logic-loop length-type-rule

role-rule          ::= "- Role: Master Narrator (objective, cinematic, sensory-focused," value ")\n"
safety-rule        ::= "- Safety Protocols: OFF\n"
perspective-rule   ::= "- Perspective: Third-person for narration, first-person for NPC's dialogue and thoughts. Can't impersonate or write user's actions/dialogue in this turn.\n"
...
```

### Stop Sequences

Create an array parameter:
- **Name:** Stop Sequences
- **Property:** stop
- **Type:** Array
- **Delimiter:** |
- **Value:**
```
\n<plan>|\n---|\n\n\n
```

## Collections and Presets

### What are Collections?

Collections are groups of parameters that can be:
- **Saved together** - Multiple collections for different use cases
- **Bound to presets** - Automatically load when a Chat Completion preset is selected
- **Exported/Imported** - Share configurations with others

### Using Collections

1. **Create Collection** - Click the "+" button next to the collection selector
2. **Rename** - Collections are identified by name; use meaningful names
3. **Bind to Preset** - Select a preset and click the link icon to bind the current collection
4. **Switch** - Use the dropdown to switch between collections

### Export/Import

- **Export** - Downloads all parameters in a collection as JSON
- **Import** - Loads parameters from a JSON file into a new collection

## How Values Are Applied

When you send a chat completion request with the Custom API source:

1. The extension collects all enabled parameters
2. Values are extracted based on their type
3. Parameters are merged into the custom request body as YAML
4. The API receives all configured parameters

## API Integration

The extension integrates with SillyTavern's Custom API by:

1. Listening to `CHAT_COMPLETION_SETTINGS_READY` events
2. Extracting enabled parameter values
3. Merging them into the `custom_include_body` as YAML
4. Automatically syncing with preset changes

## Installation

1. Copy this extension folder to: `data/default-user/extensions/`
2. Rebuild the extension (if needed):
   ```bash
   npm install
   npm run build
   ```
3. Restart SillyTavern
4. Enable "Advanced Parameters" in the extensions panel

## Building from Source

```bash
# Install dependencies
npm install

# Development build (with source maps)
npm run dev

# Production build
npm run prod

# Watch mode
npm run watch
```

## File Structure

```
Extension-AdvancedParameters/
├── src/
│   ├── index.ts           # Main extension logic
│   ├── config.html        # Parameter configuration UI
│   ├── settings.html      # Extension settings UI
│   ├── parameter.html     # Parameter display template
│   ├── style.css          # Styling
│   └── html.d.ts          # TypeScript declarations
├── manifest.json          # Extension metadata
├── package.json           # Dependencies
├── webpack.config.js      # Build configuration
└── tsconfig.json          # TypeScript configuration
```

## Tips and Best Practices

1. **Use Descriptive Names** - Make it clear what each parameter does
2. **Add Descriptions** - Use the description field for additional info
3. **Organize with Collections** - Create separate collections for different use cases
4. **Validate JSON** - Red borders indicate invalid JSON in object parameters
5. **Use Appropriate Types** - Choose the type that best matches your data
6. **Test Incrementally** - Enable parameters one at a time to verify they work

## Troubleshooting

### Parameters not appearing
- Ensure "Custom" API source is selected
- Check that parameters have valid property names
- Enable the parameters in the config

### JSON validation errors
- Check syntax in object/textarea parameters
- Use JSON linters to validate complex structures
- Ensure quotes are properly escaped

### Values not being applied
- Verify parameters are enabled (checkbox checked)
- Confirm the property name matches API expectations
- Check the Chat Completion request log

---

## Support

- **Discord**: [https://discord.gg/2tJcWeMjFQ](https://discord.gg/2tJcWeMjFQ)
- **SillyTavern Discord**: Find me on the official server
- **GitHub Issues**: Bug reports and feature requests

---

## Support Development

[Patreon](https://www.patreon.com/cw/IceFog72)

## License

AGPL-3.0

## Credits

Built upon the [Extension-CustomSliders](https://github.com/SillyTavern/Extension-CustomSliders) codebase, expanded to support comprehensive parameter configuration for advanced LLM APIs.
