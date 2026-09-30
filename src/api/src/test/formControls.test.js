import {
  fillAutocompleteField,
  selectCustomDropdown,
  uploadFileWithVerification,
  fillDatePicker,
  fillContentEditable
} from '../application/form/formFiller.js';
import assert from 'assert';

async function runFormControlsTests() {
  console.log('--- STARTING COMPLEX FORM CONTROLS TESTS ---');

  try {
    // 1. Autocomplete Test
    console.log('Test 1: Testing Autocomplete selection verification...');
    const mockPageAutocomplete = {
      $: async () => ({
        click: async () => {},
        fill: async () => {},
        type: async () => {}
      }),
      $$: async () => [
        { innerText: async () => 'React Developer', click: async () => {} },
        { innerText: async () => 'Angular Architect', click: async () => {} }
      ],
      waitForTimeout: async () => {}
    };

    const autocompleteSuccess = await fillAutocompleteField(mockPageAutocomplete, '#job-title', 'React Developer');
    assert.strictEqual(autocompleteSuccess, true);
    console.log('✅ Test 1 Passed.');

    // 2. Custom Dropdown Test
    console.log('Test 2: Testing Custom Dropdown traversal...');
    const mockPageDropdown = {
      $: async () => ({
        click: async () => {}
      }),
      $$: async () => [
        { innerText: async () => 'Master of Science', click: async () => {} },
        { innerText: async () => 'Bachelor of Engineering', click: async () => {} }
      ],
      waitForTimeout: async () => {}
    };

    const dropdownSuccess = await selectCustomDropdown(mockPageDropdown, '#education', 'Bachelor of Engineering');
    assert.strictEqual(dropdownSuccess, true);
    console.log('✅ Test 2 Passed.');

    // 3. File Upload Verification
    console.log('Test 3: Testing File Upload Verification...');
    const mockPageUpload = {
      $: async () => ({
        setInputFiles: async () => {}
      }),
      innerText: async () => 'Successfully uploaded tailored_cv.pdf',
      waitForTimeout: async () => {}
    };

    const uploadSuccess = await uploadFileWithVerification(mockPageUpload, '#resume-file', '/tmp/tailored_cv.pdf');
    assert.strictEqual(uploadSuccess, true);
    console.log('✅ Test 3 Passed.');

    // 4. Date Picker filling
    console.log('Test 4: Testing Date Picker input verification...');
    const mockPageDatePicker = {
      $: async () => ({
        click: async () => {},
        fill: async () => {},
        type: async () => {},
        press: async () => {},
        inputValue: async () => '2026-09-30'
      }),
      waitForTimeout: async () => {}
    };

    const dateSuccess = await fillDatePicker(mockPageDatePicker, '#start-date', '2026-09-30');
    assert.strictEqual(dateSuccess, true);
    console.log('✅ Test 4 Passed.');

    // 5. Contenteditable Filling
    console.log('Test 5: Testing Contenteditable text areas...');
    let evaluated = false;
    const mockPageEditable = {
      $: async () => ({
        click: async () => {},
        focus: async () => {},
        evaluate: async (fn, text) => {
          evaluated = true;
          return true;
        }
      })
    };

    const editableSuccess = await fillContentEditable(mockPageEditable, '[contenteditable="true"]', 'I am excited to apply.');
    assert.strictEqual(editableSuccess, true);
    assert.strictEqual(evaluated, true);
    console.log('✅ Test 5 Passed.');

    console.log('🎉 ALL COMPLEX FORM CONTROLS TESTS PASSED SUCCESSFULLY.');
  } catch (error) {
    console.error('❌ Form Controls Tests Failed:', error);
    process.exit(1);
  }
}

runFormControlsTests();
