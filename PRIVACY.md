# TimeShift Privacy Policy

Effective date: October 27, 2026. Applies to TimeShift 0.1.1 and later.

TimeShift converts time expressions you enter into its panel to your device's local timezone.

## Your choices and the data processed

Typing alone does not send text to TimeShift's server. Conversion results require an internet connection and an explicit click on Convert. The extension does not automatically read webpage contents, browsing history, cookies, or other tabs.

If you choose **Convert** in the online conversion section, the entire text currently entered in the panel, your target timezone, browser language, and the current timestamp are sent over HTTPS to https://timeshift-api.onrender.com. The disclosure beside that button explains this before you send anything. Each request requires a new click; editing the input does not automatically send it.

The backend first attempts rule-based parsing. When it cannot confidently parse the input, it sends the same conversion context to OpenAI to produce a structured result. Input may contain personal or website content if you paste it into the panel. Enter only the text you want processed. You may choose not to send the text and close the panel instead.

## Service providers and purposes

- **Render** hosts the TimeShift backend and processes requests and ordinary connection information, such as IP addresses and request timing, to operate the service.
- **OpenAI** processes fallback requests to recognize and convert time expressions. It receives the conversion context described above, rather than browser cookies or browsing history.

TimeShift uses this information to provide time recognition and conversion, not advertising, profiling, sale of personal data, credit decisions, or unrelated purposes. Data is shared with these providers only as needed to operate this feature.

## Storage and retention

The extension stores the panel's position in Chrome local storage. It does not save input text or conversion history to persistent extension storage. Closing the panel removes its input from the panel; removing the extension clears its extension storage.

The TimeShift application code does not write request text or conversion results to a database, user profile, or application log. This does not mean service providers retain no data. Render and OpenAI may keep operational, security, and abuse-monitoring records under their policies and the account configuration. The backend requests store: false for OpenAI responses; that setting does not eliminate all provider retention. No zero-retention promise is made.

See [Render's privacy policy](https://render.com/privacy) and [OpenAI API data controls](https://developers.openai.com/api/docs/guides/your-data) for provider practices. These services may process data outside your country.

## Security and permissions

Online requests use HTTPS. API credentials stay on the backend and are not included in the published extension.

activeTab and scripting open the floating panel in the page you choose when you click the extension icon. storage remembers the panel position. Access to the TimeShift API host is used for online conversion. The extension receives data responses and does not load remotely hosted executable code.

## Contact and changes

Contact the developer at yitao77v@gmail.com or through the [TimeShift support page](https://github.com/yitao77v-code/Timezone-Convert/issues) or the Chrome Web Store support contact. Do not include private text or credentials in a public issue. You can request information about data processing or deletion of data the developer controls through these channels.

Updates to this policy will be published in this repository and included in future extension releases.
